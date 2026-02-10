import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => { loadOrders(); }, [filter]);

  async function loadOrders() {
    try {
      const params = {};
      if (filter) params.status = filter;
      const data = await api.getOrders(params);
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    setUpdatingId(id);
    try {
      await api.updateOrderStatus(id, { status });
      loadOrders();
    } catch (err) {
      alert(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;

  const statusColors = {
    pending: 'bg-gray-100 text-gray-700',
    ordered: 'bg-blue-100 text-blue-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    issue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Orders</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !filter ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>All</button>
        {['ordered', 'shipped', 'delivered', 'issue', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === s ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>{s}</button>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No orders found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <div key={order.id} className="card">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{order.gift_name}</h3>
                    <span className={`badge ${statusColors[order.status]}`}>{order.status}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    For {order.contact_name} &middot; {order.event_name}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="font-mono">{order.order_reference}</span>
                    <span>${order.price?.toFixed(2)}</span>
                    <span>{order.retailer}</span>
                  </div>
                  {order.estimated_delivery && (
                    <p className="text-sm text-gray-500 mt-1">Est. delivery: {order.estimated_delivery}</p>
                  )}
                  {order.tracking_url && (
                    <a href={order.tracking_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:text-primary-700 mt-1 inline-block">Track shipment</a>
                  )}
                  {order.issue_description && (
                    <p className="text-sm text-red-600 mt-1">Issue: {order.issue_description}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {order.status === 'ordered' && (
                    <button onClick={() => updateStatus(order.id, 'shipped')}
                      disabled={updatingId === order.id} className="btn-secondary text-sm">
                      Mark Shipped
                    </button>
                  )}
                  {order.status === 'shipped' && (
                    <button onClick={() => updateStatus(order.id, 'delivered')}
                      disabled={updatingId === order.id} className="btn-success text-sm">
                      Mark Delivered
                    </button>
                  )}
                  {['ordered', 'shipped'].includes(order.status) && (
                    <button onClick={() => updateStatus(order.id, 'issue')}
                      disabled={updatingId === order.id} className="btn-danger text-sm">
                      Report Issue
                    </button>
                  )}
                  <Link to={`/events/${order.event_id}`} className="btn-secondary text-sm">
                    View Event
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
