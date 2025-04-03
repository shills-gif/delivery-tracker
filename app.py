from dotenv import load_dotenv
import os
from flask import Flask, jsonify, request, render_template
import sqlite3
import requests  # Using requests instead of googlemaps
from flask_cors import CORS  # Import CORS
import gspread
from oauth2client.service_account import ServiceAccountCredentials

load_dotenv()  # Load environment variables from .env

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Database connection function
def get_db_connection():
    """Establishes a connection to the SQLite database."""
    conn = sqlite3.connect('delivery_tracker.db')
    conn.row_factory = sqlite3.Row
    return conn

# Function to get latitude and longitude from an address
def get_lat_lng(address):
    """Uses the Google Geocoding API to get latitude and longitude for an address."""
    url = f"https://maps.googleapis.com/maps/api/geocode/json?address={address}&key={GOOGLE_MAPS_API_KEY}"

    response = requests.get(url)
    data = response.json()

    if "results" in data and len(data["results"]) > 0:
        location = data["results"][0]["geometry"]["location"]
        return location["lat"], location["lng"]
    else:
        return None, None  # Return None if geocoding fails
    
def get_location_name(lat, lng):
    """Uses reverse geocoding to get the town or locality for coordinates."""
    url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={GOOGLE_MAPS_API_KEY}"
    response = requests.get(url)
    data = response.json()
    
    if "results" in data and len(data["results"]) > 0:
        for component in data["results"][0]["address_components"]:
            if "locality" in component["types"] or "postal_town" in component["types"]:
                return component["long_name"]
    return "Unknown"

def get_earning_by_location(location):
    location = location.lower()

    if any(area in location for area in ["yatton keynell", "sutton benger", "draycot cerne"]):
        return 1.80
    elif any(area in location for area in ["kington langley", "kington saint michael", "langley burrell"]):
        return 1.30
    elif "chippenham" in location:
        return 1.00
    return 1.00  # fallback

# Function to get distance using Routes API
def get_distance_from_google_multi_stop(addresses):
    """
    Takes a list of addresses and returns a list of distances between each pair and a total distance.
    """
    lat_lngs = []

    for addr in addresses:
        lat, lng = get_lat_lng(addr)
        if lat is None:
            return {"error": f"Failed to get coordinates for address: {addr}"}
        lat_lngs.append({"latLng": {"latitude": lat, "longitude": lng}})

    total_distance = 0
    segment_distances = []

    for i in range(len(lat_lngs) - 1):
        body = {
            "origins": [{"waypoint": {"location": lat_lngs[i]}}],
            "destinations": [{"waypoint": {"location": lat_lngs[i + 1]}}],
            "travelMode": "DRIVE"
        }

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status"
        }

        url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
        response = requests.post(url, json=body, headers=headers).json()

        if isinstance(response, list) and len(response) > 0 and "distanceMeters" in response[0]:
            segment_km = response[0]["distanceMeters"] / 1000
            segment_distances.append(round(segment_km, 2))
            total_distance += segment_km
        else:
            return {"error": f"Failed to get distance between segment {i}-{i+1}", "details": response}

    return {
        "segment_distances": segment_distances,
        "total_distance": round(total_distance, 2)
    }


# Root route - Health check
@app.route('/')
def home():
    """Health check route for the API."""
    return jsonify({"message": "Delivery Tracker API is running!"})

# API to add a delivery
@app.route('/add_delivery', methods=['POST'])
def add_delivery():
    """Handles adding a new delivery record to the database."""

    # Debugging logs
    print("Incoming request:", request.method)
    print("Request Headers:", request.headers)
    print("Request JSON:", request.get_json())

    # Get JSON data from the request
    data = request.get_json()

    # Ensure required fields are present
    required_fields = ['origin', 'destination', 'fuel_cost', 'fuel_in_liters', 'price_per_liter']
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    # Build full route: origin + intermediate stops + destination
    full_route = [data['origin']]
    if 'stops' in data and isinstance(data['stops'], list):
        full_route.extend(data['stops'])
    full_route.append(data['destination'])

    # Calculate multi-stop distance
    distance_response = get_distance_from_google_multi_stop(full_route)

    if "error" in distance_response:
        return jsonify({"error": distance_response["error"]}), 400

    segment_distances = distance_response["segment_distances"]
    total_distance = distance_response["total_distance"]

    # Calculate earnings per stop
    total_earnings = 0
    for addr in data.get('stops', []):
        lat, lng = get_lat_lng(addr)
        if lat is None:
            return jsonify({"error": f"Failed to geocode stop: {addr}"}), 400
        location = get_location_name(lat, lng)
        earning = get_earning_by_location(location)

        # 🧾 Log debug info
        print(f"[EARNINGS DEBUG] Address: {addr}")
        print(f"[EARNINGS DEBUG] → Resolved Location: {location}")
        print(f"[EARNINGS DEBUG] → Assigned Earning: {earning}")
        
        total_earnings += earning

    # Insert into database (Ensure all fields are included)
    conn = get_db_connection()
    conn.execute(
    '''INSERT INTO deliveries (origin, destination, distance, earnings, fuel_cost, fuel_in_liters, price_per_liter, segment_distances, stops)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
    (
        data['origin'],
        data['destination'],
        total_distance,
        total_earnings,
        data['fuel_cost'],
        data['fuel_in_liters'],
        data['price_per_liter'],
        ",".join(str(d) for d in segment_distances),
        "|".join(data.get('stops', []))  # Using pipe | as delimiter in case addresses contain commas
    )
)
    conn.commit()
    conn.close()

    return jsonify({"message": "Data inserted successfully!", "distance": total_distance})

@app.route('/get_totals', methods=['GET'])
def get_totals():
    """Fetch total distance, earnings, and fuel cost."""
    conn = get_db_connection()
    totals = conn.execute('''
        SELECT
            SUM(distance) as total_distance,
            SUM(earnings) as total_earnings,
            SUM(fuel_cost) as total_fuel_cost,
            SUM(fuel_in_liters) as total_liters_purchased,
            AVG(NULLIF(price_per_liter, 0)) as avg_price_per_liter
        FROM deliveries
    ''').fetchone()
    conn.close()

    return jsonify({
        "distance": round(totals["total_distance"] or 0, 2),
        "earnings": round(totals["total_earnings"] or 0, 2),
        "fuel_cost": round(totals["total_fuel_cost"] or 0, 2),
        "liters_purchased": round(totals["total_liters_purchased"] or 0, 2),
        "fuel_spent": round(totals["avg_price_per_liter"] or 0, 2)
    })

@app.route('/clear_deliveries', methods=['POST'])
def clear_deliveries():
    """Deletes all records from the deliveries table."""
    conn = get_db_connection()
    conn.execute('DELETE FROM deliveries')
    conn.commit()
    conn.close()
    return jsonify({"message": "All delivery records have been cleared."})

# API to retrieve past deliveries
@app.route('/get_deliveries', methods=['GET'])
def get_deliveries():
    """Fetches all delivery records from the database."""
    conn = get_db_connection()
    deliveries = conn.execute('SELECT id, timestamp, origin, destination, distance, segment_distances, earnings, fuel_cost, fuel_in_liters, price_per_liter, exported FROM deliveries').fetchall()
    conn.close()

    return jsonify([dict(delivery) for delivery in deliveries])

# Web dashboard route
@app.route('/dashboard')
def dashboard():
    """Serves the dashboard HTML page."""
    return render_template('index.html')

# API to export deliveries to Google Sheets
@app.route('/export_to_sheet', methods=['POST'])
def trigger_export():
    try:
        export_to_google_sheets()
        return jsonify({"message": "Data exported successfully."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def export_to_google_sheets():
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name('gdrive_credentials.json', scope)
    client = gspread.authorize(creds)

    sheet = client.open_by_key("1nEs6q-CANw9BaCzeYdsN8QigsEF6V-L-dStQm4v5YFE").sheet1

    headers = ["ID", "Timestamp", "Origin", "Destination",
        "Address A", "Address B", "Address C", "Address D", "Address E", "Address F",
        "Distance (km)", "Segment Distances", "Earnings (£)", "Net Earnings (£)",
        "Fuel Cost (£)", "Fuel Litres", "Price Per Litre (£)"]

    if not sheet.get_all_values():  # If sheet is empty, add headers
        sheet.append_row(headers)

    conn = get_db_connection()
    deliveries = conn.execute('SELECT * FROM deliveries WHERE exported = 0').fetchall()

    valid_prices = [d["price_per_liter"] for d in deliveries if d["price_per_liter"] > 0]
    average_price = sum(valid_prices) / len(valid_prices) if valid_prices else 0

    for d in deliveries:
        segments = d["segment_distances"].split(",") if d["segment_distances"] else []
        total_distance = sum(float(s) for s in segments) if segments else d["distance"] or 0
        stops = d["stops"].split("|") if d["stops"] else []
        stops += [""] * (6 - len(stops))  # Always 6

        price_per_litre = d["price_per_liter"] if d["price_per_liter"] > 0 else average_price
        earnings = d["earnings"] or 0
        net_earnings = earnings - (total_distance * (price_per_litre / 15))

        row = [
            d["id"],
            d["timestamp"],
            d["origin"],
            d["destination"],
            stops[0], stops[1], stops[2], stops[3], stops[4], stops[5],
            round(total_distance, 2),
            d["segment_distances"],
            round(earnings, 2),
            round(net_earnings, 2),
            round(d["fuel_cost"], 2),
            round(d["fuel_in_liters"], 2),
            round(price_per_litre, 3)
        ]
        sheet.append_row(row)

        # Mark this row as exported
        conn.execute('UPDATE deliveries SET exported = 1 WHERE id = ?', (d["id"],))

    conn.commit()
    conn.close()

@app.route('/delete_delivery', methods=['POST'])
def delete_delivery():
    data = request.get_json()
    delivery_id = data.get('id')

    if not delivery_id:
        return jsonify({"error": "Missing delivery ID"}), 400

    conn = get_db_connection()
    conn.execute('DELETE FROM deliveries WHERE id = ?', (delivery_id,))
    conn.commit()
    conn.close()

    return jsonify({"message": f"Delivery {delivery_id} deleted successfully."})

@app.route('/delete_debug', methods=['GET'])
def delete_debug():
    return jsonify({"message": "NGINX routed this correctly"})

# Start Flask server
if __name__ == '__main__':
    """Runs the Flask app."""
    app.run(host='0.0.0.0', port=5000, debug=True)
