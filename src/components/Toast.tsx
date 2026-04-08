"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "@/app/provider";
import { X, StickyNote, Eye, EyeOff, Lock } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface BusinessNote {
  id?: string;
  type?: string;
  title?: string;
  name?: string;
  content?: string;
  note?: string;
  created_at?: string;
}

interface ToastProps {
  business_id?: number;
  business_name: string;
  address: string;
  before_open: boolean;
  notes?: BusinessNote[];
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ 
  business_id, 
  business_name, 
  address, 
  before_open, 
  notes: propNotes,
  onClose 
}) => {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";
  const supabase = createClient();
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [notes, setNotes] = useState<BusinessNote[]>(propNotes || []);
  const [showNotes, setShowNotes] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthAndFetchNotes();
  }, [business_id]);

  const checkAuthAndFetchNotes = async () => {
    try {
      // Check if user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      setIsAuthenticated(true);

      // If notes weren't passed as props and we have a business_id, fetch them
      if (!propNotes && business_id) {
        const { data: businessData, error: fetchError } = await supabase
          .from("Businesses")
          .select("business_notes")
          .eq("id", business_id)
          .single();

        if (!fetchError && businessData?.business_notes) {
          // Convert API format to display format
          const formattedNotes = businessData.business_notes.map((note: any) => ({
            id: note.id,
            name: note.title || note.name || "Note",
            note: note.content || note.note || "",
            type: note.type || "general",
            created_at: note.created_at
          }));
          setNotes(formattedNotes);
        }
      }
    } catch (error) {
      console.error("Error checking auth or fetching notes:", error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNotesVisibility = () => {
    setShowNotes(!showNotes);
  };

  const formatNoteContent = (note: BusinessNote) => {
    const name = note.name || note.title || "Note";
    const content = note.note || note.content || "";
    return { name, content };
  };

  const hasNotes = notes && notes.length > 0;

  return (
    <div
      className={`fixed top-5 right-5 p-5 rounded-lg max-w-sm w-full border border-[hsl(var(--border))] shadow-[var(--shadow-lg)] z-[1000] ${
        isDark 
          ? "bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]" 
          : "bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]"
      } animate-fade-in`}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:bg-[hsl(var(--destructive))]/90 transition-colors"
      >
        <X size={14} />
      </button>
      
      <h4 className="text-lg font-bold mb-3 pr-8">{business_name}</h4>
      
      <div className="space-y-3">
        <div>
          <span className="font-medium">Address:</span>{" "}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[hsl(var(--sidebar-primary))] hover:underline"
          >
            {address}
          </a>
        </div>
        
        <div className="flex items-center">
          <span className="font-medium mr-2">Cleaning Time:</span>
          <span className={`px-2 py-1 text-xs rounded-full ${
            before_open 
              ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]" 
              : "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]"
          }`}>
            {before_open ? "Before Opening Hours" : "After Closing Hours"}
          </span>
        </div>

        {/* Notes Section */}
        <div className="border-t border-[hsl(var(--border))] pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <StickyNote size={16} className="text-[hsl(var(--sidebar-primary))]" />
              <span className="font-medium text-sm">
                Notes {hasNotes ? `(${notes.length})` : "(0)"}
              </span>
            </div>
            
            {isAuthenticated && hasNotes && (
              <button
                onClick={toggleNotesVisibility}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  showNotes 
                    ? "bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]"
                    : "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/80"
                }`}
              >
                {showNotes ? <EyeOff size={12} /> : <Eye size={12} />}
                {showNotes ? "Hide" : "Show"}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              Loading notes...
            </div>
          ) : !isAuthenticated ? (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <Lock size={12} />
              <span>Notes: {hasNotes ? "Available (login required)" : "None"}</span>
            </div>
          ) : !hasNotes ? (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              No notes available
            </div>
          ) : showNotes ? (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {notes.map((note, index) => {
                const { name, content } = formatNoteContent(note);
                return (
                  <div 
                    key={note.id || index} 
                    className={`p-2 rounded text-xs ${
                      isDark ? "bg-[hsl(var(--secondary))]" : "bg-[hsl(var(--muted))]"
                    }`}
                  >
                    <div className="font-medium text-[hsl(var(--foreground))] mb-1">
                      {name}
                    </div>
                    <div className="text-[hsl(var(--muted-foreground))] break-words">
                      {content}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-[hsl(var(--muted-foreground))]">
              Notes available - click Show to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;