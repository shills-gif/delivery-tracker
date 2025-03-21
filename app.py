from flask import Flask, jsonify, request, render_template
import sqlite3
import requests  # Using requests instead of googlemaps
from flask_cors import CORS  # Import CORS


# Initialize Flask app
app = Flask(__name__)
CORS(app)


# Google Maps API setup (Replace with your actual API key)
GOOGLE_MAPS_API_KEY = "AIzaSyA8jME44DhwaZZA33iRwWdUg_sP_qlpn7s"

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

# Function to get distance using Routes API
def get_distance_from_google(origin, destination):
    """Fetches the distance between two locations using the Google Maps Routes API."""
    # Convert addresses to lat/lng
    origin_lat, origin_lng = get_lat_lng(origin)
    destination_lat, destination_lng = get_lat_lng(destination)

    if origin_lat is None or destination_lat is None:
        return {"error": "Failed to get coordinates for one or both locations."}

    url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status"
    }

    body = {
        "origins": [{"waypoint": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}}}],
        "destinations": [{"waypoint": {"location": {"latLng": {"latitude": destination_lat, "longitude": destination_lng}}}}],
        "travelMode": "DRIVE"
    }

    response = requests.post(url, json=body, headers=headers)
    data = response.json()

    if "error" in data:
        return {"error": data["error"]["message"]}
    elif isinstance(data, list) and len(data) > 0 and "distanceMeters" in data[0]:
        return {"distance_km": data[0]["distanceMeters"] / 1000}  # Convert meters to km
    else:
        return {"error": f"Unexpected response from Google API: {data}"}

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
    required_fields = ['origin', 'destination', 'earnings', 'fuel_cost', 'fuel_in_liters', 'price_per_liter']
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    # Get distance from Google Routes API
    distance_response = get_distance_from_google(data['origin'], data['destination'])

    if "error" in distance_response:
        return jsonify({"error": distance_response["error"]}), 400

    distance_km = distance_response["distance_km"]

    # Insert into database (Ensure all fields are included)
    conn = get_db_connection()
    conn.execute(
        '''INSERT INTO deliveries (distance, earnings, fuel_cost, fuel_in_liters, price_per_liter) 
           VALUES (?, ?, ?, ?, ?)''',
        (distance_km, data['earnings'], data['fuel_cost'], data['fuel_in_liters'], data['price_per_liter'])
    )
    conn.commit()
    conn.close()

    return jsonify({"message": "Data inserted successfully!", "distance": distance_km})

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
    deliveries = conn.execute('SELECT id, timestamp, origin, destination, distance, earnings, fuel_cost, fuel_in_liters, price_per_liter FROM deliveries').fetchall()
    conn.close()

    return jsonify([dict(delivery) for delivery in deliveries])

# Web dashboard route
@app.route('/dashboard')
def dashboard():
    """Serves the dashboard HTML page."""
    return render_template('index.html')

# Start Flask server
if __name__ == '__main__':
    """Runs the Flask app."""
    app.run(host='0.0.0.0', port=5000, debug=True)
