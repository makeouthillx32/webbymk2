// services/device.service.ts
export async function getDevicesUsedData(
  timeFrame?: "monthly" | "yearly" | (string & {}),
) {
  try {
    // Map timeFrame to days for API
    const days = timeFrame === "yearly" ? 365 : 30;
    
    // Use direct database query instead of API to avoid SSR issues
    const { createClient } = await import('@/utils/supabase/server');
    const supabase = await createClient();
    
    // Calculate date range
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    
    // Get real aggregated device stats
    const { data: deviceStatsData, error } = await supabase
      .from('analytics_device_stats')
      .select('*')
      .gte('date', daysAgo.toISOString().split('T')[0]);
    
    if (error) {
      console.error('Error fetching device stats:', error);
      throw error;
    }
    
    if (!deviceStatsData || deviceStatsData.length === 0) {
      // Return empty array if no data
      return [];
    }
    
    // Group devices and handle unknown devices properly
    const deviceMap = new Map();
    
    deviceStatsData.forEach((device: any) => {
      let deviceName;
      
      // If browser OR os is unknown/null, classify as "Unknown"
      if (!device.browser || device.browser === 'unknown' || !device.os || device.os === 'unknown') {
        deviceName = 'Unknown';
      } else {
        // Known device: use device_type
        deviceName = device.device_type?.charAt(0).toUpperCase() + device.device_type?.slice(1) || 'Unknown';
      }
      
      if (!deviceMap.has(deviceName)) {
        deviceMap.set(deviceName, {
          name: deviceName,
          amount: 0,
          percentage: 0
        });
      }
      
      const existing = deviceMap.get(deviceName);
      existing.amount += device.users_count || 0; // Use users_count, not page_views_count
    });
    
    // Convert to array and calculate percentages
    const data = Array.from(deviceMap.values());
    const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
    
    // Calculate percentages and round to whole numbers
    data.forEach(item => {
      const rawPercentage = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;
      item.percentage = Math.round(rawPercentage); // Round to whole number
    });
    
    // Sort by amount descending
    data.sort((a, b) => b.amount - a.amount);
    
    console.log('📊 Device service result:', {
      totalUsers: totalAmount,
      deviceBreakdown: data
    });
    
    return data;
    
  } catch (error) {
    console.error('Device service error:', error);
    throw new Error('Failed to load device analytics');
  }
}