import './App.css';
import React, { useState, useEffect } from 'react';

const API_BASE_URL = 'http://192.168.1.244:5000'; // Change if needed

function App() {
    const [deliveries, setDeliveries] = useState([]);
    const [totals, setTotals] = useState({ distance: 0, earnings: 0, fuel_cost: 0 });
    const [formData, setFormData] = useState({
        origin: '',
        destination: '',
        earnings: '1',  // Default earnings value
        fuel_cost: '0',
        fuel_in_liters: '0',
        price_per_liter: '0'
    });
    const [useCustomEarnings, setUseCustomEarnings] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // New state variables for fuel input form
    const [fuelFormData, setFuelFormData] = useState({
        fuel_in_gbp: '',
        fuel_in_liters: '',
        price_per_liter: ''
    });

    // Fetch deliveries and totals
    const fetchDeliveries = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/get_deliveries`);
            const totalResponse = await fetch(`${API_BASE_URL}/get_totals`);
            if (!response.ok || !totalResponse.ok) throw new Error("Failed to fetch data");

            const data = await response.json();
            const totalsData = await totalResponse.json();

            setDeliveries(data);
            setTotals(totalsData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeliveries();
    }, []);

    // Handle form input changes
    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // Handle earnings selection
    const handleEarningsChange = (e) => {
        if (e.target.value === "custom") {
            setUseCustomEarnings(true);
            setFormData({ ...formData, earnings: '' });
        } else {
            setUseCustomEarnings(false);
            setFormData({ ...formData, earnings: e.target.value });
        }
    };

    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", darkMode);
    }, [darkMode]);

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/add_delivery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    earnings: parseFloat(formData.earnings),
                    fuel_cost: parseFloat(formData.fuel_cost) || 0,
                    fuel_in_liters: parseFloat(formData.fuel_in_liters) || 0,
                    price_per_liter: parseFloat(formData.price_per_liter) || 0
                })
            });

            if (!response.ok) throw new Error("Error adding delivery");
            fetchDeliveries();
            setFormData({ origin: '', destination: '', earnings: '1', fuel_cost: '0', fuel_in_liters: '0', price_per_liter: '0' });
            setUseCustomEarnings(false);
        } catch (err) {
            setError(err.message);
        }
    };

    // Handle fuel form input changes
    const handleFuelChange = (e) => {
        setFuelFormData({ ...fuelFormData, [e.target.name]: e.target.value });
    };

    //Handle fuel form submission
    const handleFuelSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/add_fuel_record`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fuel_in_gbp: parseFloat(fuelFormData.fuel_in_gbp) || 0,
                    fuel_in_liters: parseFloat(fuelFormData.fuel_in_liters) || 0,
                    price_per_liter: parseFloat(fuelFormData.price_per_liter) || 0
                })
            });

            if (!response.ok) throw new Error("Error adding fuel record");
            fetchDeliveries(); // Refresh data
            setFuelFormData({ fuel_in_gbp: '', fuel_in_liters: '', price_per_liter: '' });
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="app-container">
          <h1>Delivery Earnings Tracker</h1>
      
          {/* Form */}
          <form onSubmit={handleSubmit} className="delivery-form">
            <label>
              Origin:
              <input type="text" name="origin" value={formData.origin} onChange={handleChange} required />
            </label>
      
            <label>
              Destination:
              <input type="text" name="destination" value={formData.destination} onChange={handleChange} required />
            </label>
      
            <label>
              Earnings:
              <select name="earnings" value={useCustomEarnings ? "custom" : formData.earnings} onChange={handleEarningsChange} required>
                <option value="1">1</option>
                <option value="1.30">1.30</option>
                <option value="1.80">1.80</option>
                <option value="custom">Custom</option>
              </select>
            </label>
      
            {useCustomEarnings && (
              <label>
                Custom Earnings:
                <input type="number" name="earnings" value={formData.earnings} onChange={handleChange} required />
              </label>
            )}
      
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
              <input type="number" name="price_per_liter" min="0" value={formData.price_per_liter} onChange={handleChange} required />
            </label>
      
            <button type="submit">Add Delivery</button>
          </form>
      
          {/* Error Message */}
          {error && <p className="error-message">Error: {error}</p>}
      
          {/* Loading / Table */}
          {loading ? (
            <p>Loading deliveries...</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Distance (km)</th>
                    <th>Earnings (£)</th>
                    <th>Fuel Cost (£)</th>
                    <th>Fuel Litres</th>
                    <th>Price Per Litre (p)</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((delivery) => (
                    <tr key={delivery.id}>
                      <td>{delivery.timestamp || "N/A"}</td>
                      <td>{delivery.distance?.toFixed(2)} km</td>
                      <td>£{delivery.earnings?.toFixed(2)}</td>
                      <td>£{delivery.fuel_cost?.toFixed(2)}</td>
                      <td>{delivery.fuel_in_liters?.toFixed(2)} L</td>
                      <td>p{(delivery.price_per_liter * 100).toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{totals.distance.toFixed(2)} km</td>
                    <td>£{totals.earnings.toFixed(2)}</td>
                    <td>£{totals.fuel_cost.toFixed(2)}</td>
                    <td>{totals.liters_purchased.toFixed(2)} L</td>
                    <td>p{totals.fuel_spent > 0 ? totals.fuel_spent.toFixed(0) : "N/A"}</td>
                  </tr>
      
                  <tr><td colSpan="6" style={{ height: '10px' }}></td></tr>
      
                  <tr>
                    <td></td>
                    <td>Metrics</td>
                    <td>
                      {totals.distance > 0 && totals.earnings > 0
                        ? `${(totals.distance / totals.earnings).toFixed(2)} k/e`
                        : "N/A"}
                    </td>
                    <td>
                      {totals.distance > 0 && totals.fuel_cost > 0
                        ? `${(totals.distance / totals.fuel_cost).toFixed(2)} k/£`
                        : "N/A"}
                    </td>
                    <td>
                      {totals.distance > 0 && totals.liters_purchased > 0
                        ? `${(totals.distance / totals.liters_purchased).toFixed(2)} k/l`
                        : "N/A"}
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
