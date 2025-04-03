import './App.css';
import React, { useState, useEffect, useMemo } from 'react';

const API_BASE_URL = window.location.origin;
const API_PREFIX = "";
const STORE_ADDRESS = "16 New Rd, Chippenham SN15 1HJ";

function App() {
  const [deliveries, setDeliveries] = useState([]);
  const [totals, setTotals] = useState({ distance: 0, fuel_cost: 0, liters_purchased: 0, fuel_spent: 0, earnings: 0 });
  const [formData, setFormData] = useState({
    fuel_cost: '0',
    fuel_in_liters: '0',
    price_per_liter: '0'
  });
  const [stops, setStops] = useState([""]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const [deliveriesRes, totalsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/get_deliveries`),
        fetch(`${API_BASE_URL}/get_totals`)
      ]);

      if (!deliveriesRes.ok || !totalsRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const [deliveriesData, totalsData] = await Promise.all([
        deliveriesRes.json(),
        totalsRes.json()
      ]);

      setDeliveries(deliveriesData);
      setTotals(totalsData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const addStop = () => {
    if (stops.length < 6) {
      setStops(prev => [...prev, ""]);
    }
  };

  const averagePricePerLiter = useMemo(() => {
    const validPrices = deliveries
      .map(d => d.price_per_liter)
      .filter(p => p && p > 0);

    return validPrices.length > 0
      ? validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length
      : 0;
  }, [deliveries]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const cleanedStops = stops.filter(stop => stop.trim() !== "");
      const payload = {
        origin: STORE_ADDRESS,
        destination: STORE_ADDRESS,
        stops: cleanedStops,
        fuel_cost: parseFloat(formData.fuel_cost) || 0,
        fuel_in_liters: parseFloat(formData.fuel_in_liters) || 0,
        price_per_liter: parseFloat(formData.price_per_liter) || 0
      };

      const response = await fetch(`${API_BASE_URL}/add_delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorMsg = await response.text();
        throw new Error("Error adding delivery: " + errorMsg);
      }

      await fetchDeliveries();
      setFormData({ fuel_cost: '0', fuel_in_liters: '0', price_per_liter: '0' });
      setStops([""]);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="app-container">
      <h1>Delivery Earnings Tracker</h1>

      <form onSubmit={handleSubmit} className="delivery-form">
        <p><strong>Origin:</strong> {STORE_ADDRESS}</p>

        {stops.map((stop, index) => (
          <label key={`stop-${index}`}>
            Address {String.fromCharCode(65 + index)}:
            <input
              type="text"
              value={stop}
              onChange={(e) => {
                const updatedStops = [...stops];
                updatedStops[index] = e.target.value;
                setStops(updatedStops);
              }}
              required
            />
          </label>
        ))}

        {stops.length < 6 && (
          <button type="button" onClick={addStop}>+ Add Another Stop</button>
        )}

        <p><strong>Destination:</strong> {STORE_ADDRESS}</p>

        <label>
          Fuel Cost (£):
          <input type="number" name="fuel_cost" min="0" value={formData.fuel_cost} onChange={handleChange} required />
        </label>

        <label>
          Fuel Litres:
          <input type="number" name="fuel_in_liters" min="0" value={formData.fuel_in_liters} onChange={handleChange} required />
        </label>

        <label>
          Price Per Litre (£):
          <input type="number" name="price_per_liter" min="0" step="0.001" value={formData.price_per_liter} onChange={handleChange} required />
        </label>

        <button type="submit">Add Delivery</button>
      </form>

      {error && <p className="error-message">Error: {error}</p>}
      
      <button onClick={async () => {
        console.log("Export button clicked"); // ✅ Diagnostic log
        try {
          const res = await fetch(`${API_BASE_URL}/export_to_sheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          const data = await res.json();
          console.log("Export response:", data); // ✅ View full response
          alert(data.message || data.error);
        } catch (err) {
          console.error("Export error:", err); // ✅ Log full error
          alert("Export failed: " + err.message);
        }
      }}>
        Export to Google Sheets
      </button>

      <button onClick={async () => {
        if (!window.confirm("Are you sure you want to clear all delivery data? This cannot be undone.")) return;
        try {
          const res = await fetch(`${API_BASE_URL}/clear_deliveries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          alert(data.message || "Deliveries cleared.");
          await fetchDeliveries();  // Refresh the table
        } catch (err) {
          console.error("Clear error:", err);
          alert("Failed to clear deliveries: " + err.message);
        }
      }}>
        Clear All Deliveries
      </button>

      {loading ? (
        <p>Loading deliveries...</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Segment Distances</th>
                <th>Total Distance</th>
                <th>Earnings (£)</th>
                <th>Net Earnings (£)</th>
                <th>Fuel Cost (£)</th>
                <th>Fuel Litres</th>
                <th>Price Per Litre (£)</th>
                <th>Action</th>
                <th>Exported</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => {
                const segments = delivery.segment_distances
                  ? delivery.segment_distances.split(',').map(Number)
                  : [];

                const totalDistance = segments.length > 0
                  ? segments.reduce((sum, s) => sum + s, 0)
                  : delivery.distance || 0;

                const pricePerLitre = delivery.price_per_liter > 0
                  ? delivery.price_per_liter
                  : averagePricePerLiter;

                const earnings = delivery.earnings || 0;
                const netEarnings = earnings - (totalDistance * (pricePerLitre / 15));

                return (
                  <tr key={delivery.id}>
                    <td>{delivery.timestamp || "N/A"}</td>
                    <td>{segments.length > 0 ? segments.map((seg, i) => `${i + 1}: ${seg.toFixed(2)}`).join(', ') : "N/A"}</td>
                    <td>{totalDistance.toFixed(2)} km</td>
                    <td>£{earnings.toFixed(2)}</td>
                    <td>£{netEarnings.toFixed(2)}</td>
                    <td>£{(delivery.fuel_cost || 0).toFixed(2)}</td>
                    <td>{(delivery.fuel_in_liters || 0).toFixed(2)} L</td>
                    <td>£{pricePerLitre.toFixed(3)}</td>
                    <td>
                      <button onClick={async () => {
                        if (!window.confirm("Delete this delivery?")) return;

                        try {
                          console.log("Sending delete payload", { id: delivery.id });
                          const res = await fetch(`/delete_delivery`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: delivery.id })
                          });

                          const data = await res.json();
                          alert(data.message || data.error);
                          await fetchDeliveries(); // Refresh the table
                        } catch (err) {
                          alert("Delete failed: " + err.message);
                        }
                      }}>
                        Delete
                      </button>
                    </td>
                    <td>{delivery.exported === 1 ? "Y" : "N"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2"><strong>Total</strong></td>
                <td>{totals.distance.toFixed(2)} km</td>
                <td>£{totals.earnings.toFixed(2)}</td>
                <td>
                  £{deliveries.reduce((sum, d) => {
                    const segments = d.segment_distances?.split(',').map(s => parseFloat(s.trim())).filter(Boolean) || [];
                    const totalDistance = segments.length
                      ? segments.reduce((acc, s) => acc + s, 0)
                      : parseFloat(d.distance) || 0;

                    const earnings = parseFloat(d.earnings) || 0;
                    const pricePerLitre = d.price_per_liter > 0
                      ? parseFloat(d.price_per_liter)
                      : averagePricePerLiter;

                    const netEarning = earnings - (totalDistance * (pricePerLitre / 15));

                    return sum + netEarning;
                  }, 0).toFixed(2)}
                </td>
                <td>£{totals.fuel_cost.toFixed(2)}</td>
                <td>{totals.liters_purchased.toFixed(2)} L</td>
                <td>
                  {isNaN(averagePricePerLiter)
                    ? "£N/A"
                    : `£${averagePricePerLiter.toFixed(2)}`}
                </td>
              </tr>
              <tr>
                <td colSpan="3"></td>
                <td>
                  {totals.distance > 0 && totals.earnings > 0
                    ? `km/£: ${(totals.distance / totals.earnings).toFixed(2)}`
                    : "km/£: N/A"}
                </td>
                <td>
                  {totals.distance > 0 && totals.fuel_cost > 0
                    ? `km/£ (fuel): ${(totals.distance / totals.fuel_cost).toFixed(2)}`
                    : "km/£: N/A"}
                </td>
                <td>
                  {totals.distance > 0 && totals.liters_purchased > 0
                    ? `km/l: ${(totals.distance / totals.liters_purchased).toFixed(2)}`
                    : "km/l: N/A"}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
