'use client';

import React, { useEffect, useCallback } from 'react';
import { 
  OrderStatusIcon, 
  PaymentIcon 
} from '../icons';
import { 
  Printer, 
  Truck, 
  ExternalLink, 
  Copy, 
  MoreVertical 
} from 'lucide-react';

interface OrderContextMenuProps {
  x: number;
  y: number;
  order: any;
  onClose: () => void;
  onAction: (action: string, order: any) => void;
}

export function OrderContextMenu({ x, y, order, onClose, onAction }: OrderContextMenuProps) {
  // Close menu on click outside or escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', onClose);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', onClose);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleAction = (e: React.MouseEvent, action: string) => {
    e.stopPropagation();
    onAction(action, order);
    onClose();
  };

  return (
    <div 
      className="fixed z-[100] min-w-[160px] bg-white border border-gray-200 shadow-xl rounded-lg py-1 animate-in fade-in zoom-in-95"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
        <OrderStatusIcon status={order.status} size="sm" />
        <span className="text-xs font-mono font-bold text-gray-500">{order.order_number}</span>
      </div>

      <div className="py-1">
        <button 
          onClick={(e) => handleAction(e, 'view')}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-700"
        >
          <ExternalLink className="w-4 h-4" /> View Details
        </button>
        
        <button 
          onClick={(e) => handleAction(e, 'copy_id')}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-700"
        >
          <Copy className="w-4 h-4" /> Copy ID
        </button>
      </div>

      <div className="border-t border-gray-100 py-1">
        <button 
          onClick={(e) => handleAction(e, 'print_receipt')}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 text-gray-700"
        >
          <Printer className="w-4 h-4" /> Print Receipt
        </button>
        
        <button 
          onClick={(e) => handleAction(e, 'mark_shipped')}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 text-blue-600"
        >
          <Truck className="w-4 h-4" /> Mark as Shipped
        </button>
      </div>
    </div>
  );
}