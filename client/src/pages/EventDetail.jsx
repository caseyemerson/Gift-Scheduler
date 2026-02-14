import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingGifts, setGeneratingGifts] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [selectedGift, setSelectedGift] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [approving, setApproving] = useState(false);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => { loadEvent(); }, [id]);

  async function loadEvent() {
    try {
      const data = await api.getEvent(id);
      setEvent(data);
      const approved = data.recommendations?.find(r => r.status === 'approved' || r.status === 'purchased');
      if (approved) setSelectedGift(approved.id);
      const selected = data.cardMessages?.find(m => m.selected);
      if (selected) setSelectedCard(selected.id);
    } catch (err) {
      console.error('Failed to load event:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateGifts() {
    setGeneratingGifts(true);
    try {
      await api.generateRecommendations(id);
      await loadEvent();
    } catch (err) {
      alert(err.message);
    } finally {
      setGeneratingGifts(false);
    }
  }

  async function handleGenerateCards(tones) {
    setGeneratingCards(true);
    try {
      await api.generateCardMessages(id, tones);
      await loadEvent();
    } catch (err) {
      alert(err.message);
    } finally {
      setGeneratingCards(false);
    }
  }

  async function handleApprove() {
    if (!selectedGift || !selectedCard) {
      alert('Please select both a gift and a card message before approving.');
      return;
    }
    setApproving(true);
    try {
      const approval = await api.submitApproval({
        event_id: id,
        gift_recommendation_id: selectedGift,
        card_message_id: selectedCard,
        approved_by: 'owner',
        status: 'approved',
      });
      await loadEvent();
    } catch (err) {
      alert(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function handlePlaceOrder() {
    const approvedGift = event.recommendations?.find(r => r.status === 'approved');
    const latestApproval = event.approvals?.find(a => a.status === 'approved');
    if (!approvedGift) {
      alert('Please approve a gift first.');
      return;
    }
    setOrdering(true);
    try {
      await api.createOrder({
        gift_recommendation_id: approvedGift.id,
        event_id: id,
        approval_id: latestApproval?.id,
      });
      await loadEvent();
    } catch (err) {
      alert(err.message);
    } finally {
      setOrdering(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    try {
      await api.deleteEvent(id);
      navigate('/events');
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>;
  if (!event) return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Event not found</div>;

  const daysUntil = Math.ceil((new Date(event.date) - new Date()) / (1000 * 60 * 60 * 24));
  const hasApproval = event.approvals?.some(a => a.status === 'approved');
  const hasOrder = event.orders?.length > 0;
  const approvedGift = event.recommendations?.find(r => r.status === 'approved' || r.status === 'purchased');

  // Determine workflow step
  let step = 1;
  if (event.recommendations?.length > 0) step = 2;
  if (event.cardMessages?.length > 0) step = 3;
  if (selectedGift && selectedCard) step = 4;
  if (hasApproval) step = 5;
  if (hasOrder) step = 6;

  return (
    <div className="max-w-5xl mx-auto">
      <Link to="/events" className="text-sm text-primary-600 hover:text-primary-700 mb-4 inline-block">&larr; Back to Events</Link>

      {/* Event Header */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{event.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              For <Link to={`/contacts/${event.contact_id}`} className="text-primary-600 hover:text-primary-700">{event.contact_name}</Link>
              {' '}&middot; {event.relationship} &middot; {event.type}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-lg font-bold">{new Date(event.date).toLocaleDateString()}</div>
              <div className={`text-sm font-medium ${daysUntil <= 7 ? 'text-red-600' : daysUntil <= 14 ? 'text-amber-600' : 'text-green-600'}`}>
                {daysUntil > 0 ? `${daysUntil} days away` : daysUntil === 0 ? 'Today!' : `${Math.abs(daysUntil)} days ago`}
              </div>
            </div>
            <button onClick={handleDelete} className="text-gray-400 hover:text-red-500 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Workflow progress */}
        <div className="mt-6 flex items-center gap-1 overflow-x-auto">
          {['Recommendations', 'Card Messages', 'Select', 'Approve', 'Order'].map((label, i) => (
            <div key={label} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                i + 1 < step ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                i + 1 === step ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' :
                'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {i + 1 < step ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
                {label}
              </div>
              {i < 4 && <div className={`w-4 h-0.5 ${i + 1 < step ? 'bg-green-300 dark:bg-green-700' : 'bg-gray-200 dark:bg-gray-600'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Gift Recommendations */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Gift Recommendations</h2>
          <button onClick={handleGenerateGifts} disabled={generatingGifts} className="btn-primary text-sm">
            {generatingGifts ? 'Generating...' : event.recommendations?.length > 0 ? 'Regenerate' : 'Generate Recommendations'}
          </button>
        </div>

        {event.recommendations?.length > 0 ? (
          <div className="space-y-3">
            {event.recommendations.map(gift => (
              <div key={gift.id}
                onClick={() => !hasOrder && setSelectedGift(gift.id)}
                className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  selectedGift === gift.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : gift.status === 'purchased'
                    ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{gift.name}</h3>
                      {gift.status !== 'recommended' && (
                        <span className={`badge ${
                          gift.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                          gift.status === 'purchased' ? 'bg-green-100 text-green-700' :
                          gift.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{gift.status}</span>
                      )}
                      {!gift.in_stock && (
                        <span className="badge bg-red-100 text-red-700">Delivery risk</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{gift.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 italic">{gift.reasoning}</p>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-lg font-bold">${gift.price.toFixed(2)}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{gift.retailer}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Est. {gift.estimated_delivery}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">Click "Generate Recommendations" to get gift suggestions based on the contact's preferences and budget.</p>
        )}
      </div>

      {/* Step 2: Card Messages */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Card Messages</h2>
          <div className="flex gap-2">
            <button onClick={() => handleGenerateCards(['warm', 'heartfelt'])} disabled={generatingCards} className="btn-primary text-sm">
              {generatingCards ? 'Generating...' : event.cardMessages?.length > 0 ? 'Regenerate' : 'Generate Messages'}
            </button>
          </div>
        </div>

        {event.cardMessages?.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="text-sm text-gray-500 dark:text-gray-400 py-1">Tone:</span>
            {['warm', 'formal', 'humorous', 'heartfelt', 'casual'].map(tone => (
              <button key={tone} onClick={() => handleGenerateCards([tone])}
                className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors capitalize">
                {tone}
              </button>
            ))}
          </div>
        )}

        {event.cardMessages?.length > 0 ? (
          <div className="space-y-3">
            {event.cardMessages.map(msg => (
              <div key={msg.id}
                onClick={() => !hasOrder && setSelectedCard(msg.id)}
                className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  selectedCard === msg.id || msg.selected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'
                }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <span className="badge bg-gray-100 text-gray-600 mb-2 capitalize">{msg.tone}</span>
                    <p className="text-gray-700 dark:text-gray-300 mt-1">{msg.message}</p>
                  </div>
                  {(selectedCard === msg.id || msg.selected) && (
                    <svg className="w-6 h-6 text-primary-600 flex-shrink-0 ml-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">Click "Generate Messages" to create card message drafts.</p>
        )}
      </div>

      {/* Approval & Order Section */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Approval & Order</h2>

        {hasOrder ? (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">Order Placed</h3>
              {event.orders?.map(order => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Reference: <span className="font-mono">{order.order_reference}</span></p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Status: <span className="font-medium capitalize">{order.status}</span></p>
                    {order.estimated_delivery && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">Est. delivery: {order.estimated_delivery}</p>
                    )}
                  </div>
                  <span className={`badge ${
                    order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                    order.status === 'shipped' ? 'bg-purple-100 text-purple-700' :
                    order.status === 'ordered' ? 'bg-blue-100 text-blue-700' :
                    order.status === 'issue' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{order.status}</span>
                </div>
              ))}
            </div>
            {approvedGift && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <p className="text-sm font-medium">Selected gift: {approvedGift.name} (${approvedGift.price.toFixed(2)})</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{approvedGift.retailer}</p>
              </div>
            )}
          </div>
        ) : hasApproval ? (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-blue-800 dark:text-blue-300 font-medium">Gift approved! Ready to place order.</p>
              {approvedGift && (
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">{approvedGift.name} - ${approvedGift.price.toFixed(2)} from {approvedGift.retailer}</p>
              )}
            </div>
            <button onClick={handlePlaceOrder} disabled={ordering} className="btn-success w-full">
              {ordering ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedGift && selectedCard ? (
              <>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <p className="text-amber-800 dark:text-amber-300 font-medium">Ready for approval</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    Gift and card message selected. Review your choices and approve to proceed.
                  </p>
                </div>
                <button onClick={handleApprove} disabled={approving} className="btn-primary w-full">
                  {approving ? 'Approving...' : 'Approve Gift & Card'}
                </button>
              </>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-gray-500 dark:text-gray-400 text-sm">
                {!event.recommendations?.length
                  ? 'Step 1: Generate gift recommendations above.'
                  : !event.cardMessages?.length
                  ? 'Step 2: Generate card messages above.'
                  : 'Select a gift and a card message to proceed with approval.'}
              </div>
            )}
          </div>
        )}

        {/* Approval history */}
        {event.approvals?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Approval History</h3>
            {event.approvals.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm py-1">
                <span className={a.status === 'approved' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                  {a.status} by {a.approved_by}
                </span>
                <span className="text-gray-400">{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
