import React from 'react';
import { 
  Package, 
  Truck, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  CreditCard, 
  Receipt, 
  MapPin, 
  Box,
  AlertCircle,
  History
} from 'lucide-react';

interface OrderIconProps {
  status?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
};

/**
 * Main Order Status Icon component
 */
export function OrderStatusIcon({ status, size = 'md', className = '' }: OrderIconProps) {
  const sizeClass = sizeClasses[size];
  const iconClass = `${sizeClass} ${className}`;

  switch (status?.toLowerCase()) {
    case 'pending':
      return <Clock className={`${iconClass} text-amber-500`} />;
    case 'processing':
      return <Box className={`${iconClass} text-blue-500 animate-pulse`} />;
    case 'shipped':
      return <Truck className={`${iconClass} text-indigo-500`} />;
    case 'delivered':
      return <CheckCircle2 className={`${iconClass} text-green-500`} />;
    case 'cancelled':
      return <XCircle className={`${iconClass} text-red-500`} />;
    case 'refunded':
      return <History className={`${iconClass} text-purple-500`} />;
    default:
      return <Package className={iconClass} />;
  }
}

/**
 * Branded Payment Method Icons
 */
export function PaymentIcon({ method, size = 'md', className = '' }: { method: string } & Omit<OrderIconProps, 'status'>) {
  const sizeClass = sizeClasses[size];
  const iconClass = `${sizeClass} ${className}`;

  if (method.toLowerCase().includes('visa') || method.toLowerCase().includes('mastercard')) {
    return <CreditCard className={`${iconClass} text-slate-700`} />;
  }
  return <Receipt className={iconClass} />;
}

/**
 * Logistical Utility Icons
 */
export function ShippingIcon({ size = 'md', className = '' }: Omit<OrderIconProps, 'status'>) {
  return <MapPin className={`${sizeClasses[size]} ${className} text-red-500`} />;
}

export function FulfillmentIcon({ size = 'md', className = '' }: Omit<OrderIconProps, 'status'>) {
  return <Package className={`${sizeClasses[size]} ${className} text-orange-500`} />;
}

/**
 * Branded Badge Icons (Solid backgrounds like your original file)
 */
export function StatusBadgeIcon({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const bgColors: Record<string, string> = {
    paid: 'bg-green-600',
    unpaid: 'bg-red-600',
    partial: 'bg-yellow-600',
  };

  const color = bgColors[status.toLowerCase()] || 'bg-gray-600';
  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';

  return (
    <div className={`${color} rounded-sm flex items-center justify-center text-white font-bold uppercase tracking-wider ${sizeClass}`}>
      {status}
    </div>
  );
}

export default {
  OrderStatusIcon,
  PaymentIcon,
  ShippingIcon,
  FulfillmentIcon,
  StatusBadgeIcon
};