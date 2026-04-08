import { useState, useEffect } from "react";
import { useTheme } from "@/app/provider";
import { CheckCircle2, Circle, ArrowRight, RefreshCw, Calendar, Check, X, Plus, Search } from "lucide-react";
import UniversalExportButton, { ExportTemplate } from "@/components/UniversalExportButton";
import { CMSBillingTemplate, BusinessCleaningRecord } from "@/lib/CMSBillingTemplate";

interface CleanTrackItem {
  id?: number;
  business_id: number;
  business_name: string;
  address: string;
  before_open: boolean;
  status: "pending" | "cleaned" | "missed" | "moved";
  cleaned_at?: string;
  moved_to_date?: string;
  notes?: string;
  marked_by?: string;
  updated_at?: string;
  is_added?: boolean;
}

interface DailyInstance {
  id: number;
  instance_date: string;
  week_number: number;
  day_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface AvailableBusiness {
  id: number;
  business_name: string;
  address: string;
  before_open: boolean;
}

interface CleanTrackProps {
  cleanTrack: CleanTrackItem[];
  currentInstance: DailyInstance | null;
  currentDay: string;
  week: number;
  instanceLoading: boolean;
  onToggleBusinessStatus: (businessId: number) => void;
  onMoveBusinessToDate: (businessId: number, date: string) => void;
  onRefreshInstance: () => void;
  onAddBusiness: (businessId: number, notes?: string) => void;
}

function getPacificTimeDate(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
}

function getLocalDate(): string {
  const pacificTime = getPacificTimeDate();
  const year = pacificTime.getFullYear();
  const month = String(pacificTime.getMonth() + 1).padStart(2, '0');
  const day = String(pacificTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CleanTrack({
  cleanTrack,
  currentInstance,
  currentDay,
  week,
  instanceLoading,
  onToggleBusinessStatus,
  onMoveBusinessToDate,
  onRefreshInstance,
  onAddBusiness
}: CleanTrackProps) {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  const [movingBusiness, setMovingBusiness] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [billingData, setBillingData] = useState<BusinessCleaningRecord[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const pacificTime = getPacificTimeDate();
    return pacificTime.getMonth() + 1;
  });
  const [currentYear, setCurrentYear] = useState(() => {
    const pacificTime = getPacificTimeDate();
    return pacificTime.getFullYear();
  });
  
  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [availableBusinesses, setAvailableBusinesses] = useState<AvailableBusiness[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBusinessToAdd, setSelectedBusinessToAdd] = useState<AvailableBusiness | null>(null);
  const [addBusinessNotes, setAddBusinessNotes] = useState("");

  const completed = cleanTrack.filter(item => item.status === "cleaned").length;
  const moved = cleanTrack.filter(item => item.status === "moved").length;
  const pending = cleanTrack.filter(item => item.status === "pending").length;
  const added = cleanTrack.filter(item => item.is_added).length;

  useEffect(() => {
    loadBillingData();
    loadAvailableBusinesses();
  }, [currentInstance]);

  const loadAvailableBusinesses = async () => {
    try {
      const res = await fetch('/api/schedule/businesses');
      if (res.ok) {
        const businesses = await res.json();
        const currentBusinessIds = new Set(cleanTrack.map(item => item.business_id));
        const available = businesses.filter((business: any) => 
          !currentBusinessIds.has(business.id)
        );
        setAvailableBusinesses(available);
      }
    } catch (error) {
      console.error('Error loading available businesses:', error);
    }
  };

  const loadBillingData = async () => {
    if (!currentInstance) return;

    try {
      const pacificTime = getPacificTimeDate();
      const month = pacificTime.getMonth() + 1;
      const year = pacificTime.getFullYear();
      
      setCurrentMonth(month);
      setCurrentYear(year);

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const businessesRes = await fetch('/api/schedule/businesses');
      if (!businessesRes.ok) throw new Error('Failed to fetch businesses');
      const allBusinesses = await businessesRes.json();

      const instancesRes = await fetch(
        `/api/schedule/daily-instances/monthly?start_date=${startDateStr}&end_date=${endDateStr}`
      );
      if (!instancesRes.ok) throw new Error('Failed to fetch monthly data');
      const monthlyData = await instancesRes.json();

      const businessRecords = new Map<number, BusinessCleaningRecord>();

      allBusinesses.forEach((business: any) => {
        businessRecords.set(business.id, {
          business_id: business.id,
          business_name: business.business_name,
          address: business.address,
          cleaned_dates: [],
          moved_dates: [],
          added_dates: []
        });
      });

      monthlyData.instances?.forEach((instance: any) => {
        const instanceDate = new Date(instance.instance_date);
        const dayOfMonth = instanceDate.getDate();

        instance.daily_clean_items?.forEach((item: any) => {
          const record = businessRecords.get(item.business_id);
          if (record) {
            if (item.status === 'cleaned') {
              if (!record.cleaned_dates.includes(dayOfMonth)) {
                record.cleaned_dates.push(dayOfMonth);
              }
            } else if (item.status === 'moved') {
              if (!record.moved_dates.includes(dayOfMonth)) {
                record.moved_dates.push(dayOfMonth);
              }
            }
            
            if (item.is_added && item.status === 'cleaned') {
              if (!record.added_dates.includes(dayOfMonth)) {
                record.added_dates.push(dayOfMonth);
              }
            }
          }
        });
      });

      const processedData = Array.from(businessRecords.values())
        .sort((a, b) => a.business_name.localeCompare(b.business_name));

      setBillingData(processedData);

    } catch (error) {
      console.error('Error loading billing data:', error);
    }
  };

  const handleMoveClick = (businessId: number) => {
    setMovingBusiness(businessId);
    setSelectedDate("");
  };

  const handleDateConfirm = () => {
    if (movingBusiness && selectedDate) {
      onMoveBusinessToDate(movingBusiness, selectedDate);
      setMovingBusiness(null);
      setSelectedDate("");
    }
  };

  const handleCancelMove = () => {
    setMovingBusiness(null);
    setSelectedDate("");
  };

  const handleAddBusinessClick = () => {
    setShowAddBusiness(true);
    setSearchTerm("");
    setSelectedBusinessToAdd(null);
    setAddBusinessNotes("");
    loadAvailableBusinesses();
  };

  const handleCancelAdd = () => {
    setShowAddBusiness(false);
    setSearchTerm("");
    setSelectedBusinessToAdd(null);
    setAddBusinessNotes("");
  };

  const handleConfirmAdd = () => {
    if (selectedBusinessToAdd) {
      const notes = addBusinessNotes.trim() || `Added on-the-fly - moved from another day`;
      onAddBusiness(selectedBusinessToAdd.id, notes);
      handleCancelAdd();
    }
  };

  const filteredBusinesses = availableBusinesses.filter(business =>
    business.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    business.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "cleaned":
        return <CheckCircle2 size={20} className="text-green-600" />;
      case "moved":
        return <ArrowRight size={20} className="text-yellow-600" />;
      default:
        return <Circle size={20} className="text-[hsl(var(--muted-foreground))]" />;
    }
  };

  const getStatusText = (item: CleanTrackItem) => {
    switch (item.status) {
      case "cleaned":
        return (
          <span className="text-green-600 font-medium">
            ✓ Cleaned {item.cleaned_at && `at ${new Date(item.cleaned_at).toLocaleTimeString()}`}
          </span>
        );
      case "moved":
        return (
          <span className="text-yellow-600 font-medium">
            → Moved to {item.moved_to_date && new Date(item.moved_to_date).toLocaleDateString()}
          </span>
        );
      default:
        return <span className="text-[hsl(var(--muted-foreground))]">Pending</span>;
    }
  };

  const billingTemplate: ExportTemplate = {
    id: 'cms-billing-unified',
    name: 'CMS Billing Report',
    data: {
      month: currentMonth,
      year: currentYear,
      generated_from: 'clean_track',
      instance_info: currentInstance ? {
        id: currentInstance.id,
        date: currentInstance.instance_date,
        day: currentInstance.day_name
      } : null
    },
    generator: async (data: any, format: 'excel' | 'pdf') => {
      console.log(`🎯 Generating CMS Billing Report as ${format.toUpperCase()} with FRESH data`);
      const { month, year } = data;
      
      console.log(`🔄 Fetching fresh billing data for ${month}/${year} from database...`);
      
      const template = new CMSBillingTemplate(month, year);
      await template.fetchCleaningData();
      
      if (format === 'excel') {
        const arrayBuffer = template.generateExcel();
        return new Blob([arrayBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
      } else {
        return template.generateHTML();
      }
    }
  };

  const getMonthName = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[currentMonth - 1] || '';
  };

  return (
    <div
      className={`rounded-lg p-4 ${
        isDark
          ? "bg-[hsl(var(--card))] shadow-[var(--shadow-md)]"
          : "bg-[hsl(var(--background))] shadow-[var(--shadow-sm)]"
      }`}
    >
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold flex items-center">
            <CheckCircle2 size={24} className="mr-2 text-[hsl(var(--sidebar-primary))]" />
            Clean Track - {currentDay.charAt(0).toUpperCase() + currentDay.slice(1)}
          </h3>
          <div className="flex items-center space-x-2">
            {currentInstance && (
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Instance #{currentInstance.id}
              </div>
            )}
            <button
              onClick={handleAddBusinessClick}
              className="px-3 py-1 text-sm bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] rounded hover:bg-[hsl(var(--sidebar-primary))]/90 transition-colors flex items-center"
              title="Add business cleaned today"
            >
              <Plus size={14} className="mr-1" />
              Add Business
            </button>
            <button
              onClick={onRefreshInstance}
              disabled={instanceLoading}
              className="p-2 hover:bg-[hsl(var(--secondary))] rounded transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={16} className={instanceLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        
        {currentInstance && (
          <div className="text-sm text-[hsl(var(--muted-foreground))] mb-4">
            <div className="flex items-center space-x-4">
              <span>📅 {getPacificTimeDate().toLocaleDateString()}</span>
              <span>👥 Shared with team</span>
              <span>🔄 Last updated: {new Date(currentInstance.updated_at).toLocaleTimeString()}</span>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-4 gap-4 mb-4">
          <div className={`p-3 rounded-lg text-center ${
            isDark ? "bg-[hsl(var(--secondary))]" : "bg-[hsl(var(--muted))]"
          }`}>
            <div className="text-2xl font-bold text-green-600">{completed}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Cleaned</div>
          </div>
          <div className={`p-3 rounded-lg text-center ${
            isDark ? "bg-[hsl(var(--secondary))]" : "bg-[hsl(var(--muted))]"
          }`}>
            <div className="text-2xl font-bold text-[hsl(var(--muted-foreground))]">{pending}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Pending</div>
          </div>
          <div className={`p-3 rounded-lg text-center ${
            isDark ? "bg-[hsl(var(--secondary))]" : "bg-[hsl(var(--muted))]"
          }`}>
            <div className="text-2xl font-bold text-yellow-600">{moved}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Moved</div>
          </div>
          <div className={`p-3 rounded-lg text-center ${
            isDark ? "bg-[hsl(var(--secondary))]" : "bg-[hsl(var(--muted))]"
          }`}>
            <div className="text-2xl font-bold text-blue-600">{added}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Added</div>
          </div>
        </div>
      </div>

      {showAddBusiness && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`w-full max-w-md mx-4 rounded-lg p-6 ${
            isDark ? "bg-[hsl(var(--card))]" : "bg-white"
          }`}>
            <h4 className="text-lg font-semibold mb-4 text-[hsl(var(--foreground))]">
              Add Business to Today's Cleaning
            </h4>
            
            <div className="mb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
                <input
                  type="text"
                  placeholder="Search businesses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--input))] text-[hsl(var(--foreground))]"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto mb-4 border border-[hsl(var(--border))] rounded">
              {filteredBusinesses.length > 0 ? (
                filteredBusinesses.map((business) => (
                  <button
                    key={business.id}
                    onClick={() => setSelectedBusinessToAdd(business)}
                    className={`w-full p-3 text-left border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[hsl(var(--accent))] transition-colors ${
                      selectedBusinessToAdd?.id === business.id ? "bg-[hsl(var(--accent))]" : ""
                    }`}
                  >
                    <div className="font-medium text-[hsl(var(--foreground))]">
                      {business.business_name}
                    </div>
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                      {business.address}
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${
                      business.before_open 
                        ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]" 
                        : "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]"
                    }`}>
                      {business.before_open ? "Before Open" : "After Close"}
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-[hsl(var(--muted-foreground))]">
                  No businesses found
                </div>
              )}
            </div>

            {selectedBusinessToAdd && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-[hsl(var(--foreground))]">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Moved from another day, Extra cleaning"
                  value={addBusinessNotes}
                  onChange={(e) => setAddBusinessNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded bg-[hsl(var(--input))] text-[hsl(var(--foreground))]"
                />
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={handleCancelAdd}
                className="flex-1 px-4 py-2 border border-[hsl(var(--border))] rounded text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={!selectedBusinessToAdd}
                className={`flex-1 px-4 py-2 bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] rounded hover:bg-[hsl(var(--sidebar-primary))]/90 transition-colors flex items-center justify-center ${
                  !selectedBusinessToAdd ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <Plus size={16} className="mr-1" />
                Add to Track
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {cleanTrack.map((item) => (
          <div
            key={item.business_id}
            className={`p-4 rounded-lg border border-[hsl(var(--border))] transition-all ${
              isDark
                ? "bg-[hsl(var(--card))]"
                : "bg-[hsl(var(--background))]"
            } ${
              item.status === "cleaned" 
                ? "border-green-200 bg-green-50/50" 
                : item.status === "moved"
                ? "border-yellow-200 bg-yellow-50/50"
                : item.is_added
                ? "border-blue-200 bg-blue-50/50"
                : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <button
                  onClick={() => onToggleBusinessStatus(item.business_id)}
                  className="mt-1 hover:scale-110 transition-transform"
                  disabled={item.status === "moved"}
                >
                  {getStatusIcon(item.status)}
                </button>

                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-semibold text-[hsl(var(--foreground))]">
                      {item.business_name}
                    </h4>
                    {item.is_added && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        Added
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mb-1">
                    {item.address}
                  </p>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      item.before_open 
                        ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]" 
                        : "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]"
                    }`}>
                      {item.before_open ? "Before Open" : "After Close"}
                    </span>
                    {getStatusText(item)}
                  </div>
                  {item.notes && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 italic">
                      📝 {item.notes}
                    </p>
                  )}
                </div>
              </div>

              {item.status === "pending" && (
                <div className="flex items-center space-x-2">
                  {movingBusiness === item.business_id ? (
                    <div className="flex items-center space-x-2 animate-in slide-in-from-right-2">
                      <Calendar size={16} className="text-[hsl(var(--muted-foreground))]" />
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-2 py-1 text-sm border border-[hsl(var(--border))] rounded bg-[hsl(var(--input))] text-[hsl(var(--foreground))]"
                        min={getLocalDate()}
                        autoFocus
                      />
                      <button
                        onClick={handleDateConfirm}
                        disabled={!selectedDate}
                        className={`p-2 rounded transition-colors ${
                          selectedDate
                            ? "bg-green-600 text-white hover:bg-green-700"
                            : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] cursor-not-allowed"
                        }`}
                        title="Confirm move"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={handleCancelMove}
                        className="p-2 bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] rounded hover:bg-[hsl(var(--secondary))] transition-colors"
                        title="Cancel move"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleMoveClick(item.business_id)}
                      className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                    >
                      Move
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 border-t border-[hsl(var(--border))]">
        <div className="flex items-center justify-between">
          <div className="text-sm text-[hsl(var(--muted-foreground))]">
            Progress: {completed} of {cleanTrack.length} completed
            {moved > 0 && ` • ${moved} moved`}
            {added > 0 && ` • ${added} added`}
          </div>
          
          {billingData.length > 0 && currentInstance && (
            <div className="flex items-center space-x-2">
              <button
                onClick={loadBillingData}
                className="px-3 py-1 text-sm bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded hover:bg-[hsl(var(--secondary))]/80 transition-colors"
                title="Refresh billing data"
              >
                🔄 Refresh
              </button>
              <UniversalExportButton
                template={billingTemplate}
                filename={`CMS_Billing_${getMonthName()}_${currentYear}_from_CleanTrack`}
                disabled={instanceLoading}
                size="md"
                variant="primary"
              />
            </div>
          )}
        </div>
        
        {billingData.length > 0 && (
          <div className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
            💡 Export includes all {billingData.length} businesses for {getMonthName()} {currentYear}
          </div>
        )}
      </div>
    </div>
  );
}