"use client";

import { useState, useEffect, useCallback } from "react";

export interface MailThread {
  id: string;
  mailbox: string;
  subject: string;
  snippet: string;
  folder: "inbox" | "drafts" | "sent" | "junk" | "trash" | "archive";
  is_read: boolean;
  labels: string[];
  participant_names: string[];
  participant_emails: string[];
  last_message_at: string;
  created_at: string;
}

export interface MailMessage {
  id: string;
  thread_id: string;
  from_name: string;
  from_email: string;
  to_emails: string[];
  subject: string;
  body_text: string;
  body_html?: string | null;
  date?: string;
  created_at: string;
  is_outgoing: boolean;
  read: boolean;
}

interface MailState {
  mailbox: string;
  folder: string;
  search: string;
  selectedThreadId: string | null;
  threads: MailThread[];
  activeMessages: MailMessage[];
  loadingThreads: boolean;
  loadingMessages: boolean;
  sending: boolean;
}

let globalState: MailState = {
  mailbox: "support@unenter.live",
  folder: "inbox",
  search: "",
  selectedThreadId: null,
  threads: [],
  activeMessages: [],
  loadingThreads: false,
  loadingMessages: false,
  sending: false,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function useMail() {
  const [state, setState] = useState<MailState>(globalState);

  useEffect(() => {
    const handleUpdate = () => setState({ ...globalState });
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const loadThreads = useCallback(async (mailbox = globalState.mailbox, folder = globalState.folder, search = globalState.search) => {
    globalState.loadingThreads = true;
    notify();
    try {
      const queryParams = new URLSearchParams({
        mailbox,
        folder,
        ...(search ? { q: search } : {}),
      });
      const res = await fetch(`/api/mail/threads?${queryParams.toString()}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.threads)) {
        globalState.threads = data.threads;
        // Automatically select the first thread if none selected or selected thread no longer in list
        if (!globalState.selectedThreadId && data.threads.length > 0) {
          globalState.selectedThreadId = data.threads[0].id;
          loadThreadDetails(data.threads[0].id);
        } else if (globalState.selectedThreadId) {
          loadThreadDetails(globalState.selectedThreadId);
        }
      }
    } catch (err) {
      console.error("[useMail] Failed to load threads:", err);
    } finally {
      globalState.loadingThreads = false;
      notify();
    }
  }, []);

  const loadThreadDetails = useCallback(async (threadId: string) => {
    globalState.loadingMessages = true;
    notify();
    try {
      const res = await fetch(`/api/mail/threads/${threadId}`);
      const data = await res.json();
      if (res.ok) {
        globalState.activeMessages = data.messages || [];
        // Mark as read locally and on server
        const currentThread = globalState.threads.find((t) => t.id === threadId);
        if (currentThread && !currentThread.is_read) {
          currentThread.is_read = true;
          fetch(`/api/mail/threads/${threadId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_read: true }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[useMail] Failed to load thread details:", err);
    } finally {
      globalState.loadingMessages = false;
      notify();
    }
  }, []);

  const setMailbox = useCallback((mailbox: string) => {
    globalState.mailbox = mailbox;
    globalState.selectedThreadId = null;
    globalState.activeMessages = [];
    notify();
    loadThreads(mailbox, globalState.folder, globalState.search);
  }, [loadThreads]);

  const setFolder = useCallback((folder: string) => {
    globalState.folder = folder;
    globalState.selectedThreadId = null;
    globalState.activeMessages = [];
    notify();
    loadThreads(globalState.mailbox, folder, globalState.search);
  }, [loadThreads]);

  const setSearch = useCallback((search: string) => {
    globalState.search = search;
    notify();
    loadThreads(globalState.mailbox, globalState.folder, search);
  }, [loadThreads]);

  const selectThread = useCallback((threadId: string) => {
    globalState.selectedThreadId = threadId;
    notify();
    loadThreadDetails(threadId);
  }, [loadThreadDetails]);

  const sendReply = useCallback(async (text: string) => {
    if (!globalState.selectedThreadId || !text.trim()) return false;
    const currentThread = globalState.threads.find((t) => t.id === globalState.selectedThreadId);
    if (!currentThread) return false;

    // Recipient is the other participant
    const to = currentThread.participant_emails.find((e) => e !== globalState.mailbox) || currentThread.participant_emails[0];

    globalState.sending = true;
    notify();
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: currentThread.id,
          mailbox: globalState.mailbox,
          to,
          subject: currentThread.subject.startsWith("Re:") ? currentThread.subject : `Re: ${currentThread.subject}`,
          text,
        }),
      });

      const data = await res.json();
      if (res.ok && data.message) {
        globalState.activeMessages = [...globalState.activeMessages, data.message];
        currentThread.snippet = text.substring(0, 120);
        currentThread.last_message_at = new Date().toISOString();
        notify();
        return true;
      }
    } catch (err) {
      console.error("[useMail] Failed to send reply:", err);
    } finally {
      globalState.sending = false;
      notify();
    }
    return false;
  }, []);

  const moveToFolder = useCallback(async (folder: string) => {
    if (!globalState.selectedThreadId) return;
    const threadId = globalState.selectedThreadId;
    try {
      await fetch(`/api/mail/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      // Remove from current list
      globalState.threads = globalState.threads.filter((t) => t.id !== threadId);
      globalState.selectedThreadId = globalState.threads[0]?.id || null;
      if (globalState.selectedThreadId) {
        loadThreadDetails(globalState.selectedThreadId);
      } else {
        globalState.activeMessages = [];
      }
      notify();
    } catch (err) {
      console.error("[useMail] Move folder failed:", err);
    }
  }, [loadThreadDetails]);

  // Initial load
  useEffect(() => {
    if (globalState.threads.length === 0 && !globalState.loadingThreads) {
      loadThreads();
    }
  }, [loadThreads]);

  const activeThread = globalState.threads.find((t) => t.id === globalState.selectedThreadId) || null;

  return {
    state,
    activeThread,
    setMailbox,
    setFolder,
    setSearch,
    selectThread,
    sendReply,
    moveToFolder,
    refresh: () => loadThreads(),
  };
}
