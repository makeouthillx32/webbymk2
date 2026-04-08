'use client';

import { Smile, Paperclip, Send, X, Image, FileText } from 'lucide-react';
import { useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'react-hot-toast';
import './MessageInput.scss';

// Create Supabase client
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface MessageInputProps {
  message: string;
  onSetMessage: (message: string) => void;
  handleSendMessage: (e: React.FormEvent, attachments?: AttachmentData[]) => void;
}

interface AttachmentData {
  url: string;
  type: 'image' | 'file';
  name: string;
  size: number;
}

export default function MessageInput({
  message,
  onSetMessage,
  handleSendMessage,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentPreviews, setAttachmentPreviews] = useState<AttachmentData[]>([]);

  // Handle file selection (allow multiple files)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check total files limit (max 5 files)
    if (selectedFiles.length + files.length > 5) {
      toast.error('Maximum 5 files allowed per message');
      return;
    }

    const validFiles: File[] = [];
    const validPreviews: AttachmentData[] = [];

    files.forEach(file => {
      // Check file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast.error(`${file.name}: File size must be less than 10MB`);
        return;
      }

      // Check file type
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];

      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name}: File type not supported`);
        return;
      }

      validFiles.push(file);

      // Create preview
      const fileType = file.type.startsWith('image/') ? 'image' : 'file';
      const preview: AttachmentData = {
        url: fileType === 'image' ? URL.createObjectURL(file) : '',
        type: fileType,
        name: file.name,
        size: file.size
      };
      validPreviews.push(preview);
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
    setAttachmentPreviews(prev => [...prev, ...validPreviews]);
  };

  // Upload files to Supabase Storage
  const uploadFiles = async (files: File[]): Promise<AttachmentData[]> => {
    try {
      setIsUploading(true);
      const uploadPromises = files.map(async (file) => {
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('attachments')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('Upload error:', error);
          throw new Error(`Failed to upload ${file.name}`);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('attachments')
          .getPublicUrl(fileName);

        return {
          url: publicUrl,
          type: file.type.startsWith('image/') ? 'image' as const : 'file' as const,
          name: file.name,
          size: file.size
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      return uploadedFiles;
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload files');
      return [];
    } finally {
      setIsUploading(false);
    }
  };

  // Handle form submit with attachments
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If there are files, upload them first
    if (selectedFiles.length > 0) {
      const uploadedFiles = await uploadFiles(selectedFiles);
      
      if (uploadedFiles.length > 0) {
        // Send message with attachments
        handleSendMessage(e, uploadedFiles);
        
        // Clear attachments
        clearAttachments();
      }
    } else {
      // Send regular text message
      handleSendMessage(e);
    }
  };

  // Clear selected attachments
  const clearAttachments = () => {
    setSelectedFiles([]);
    setAttachmentPreviews([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove specific attachment
  const removeAttachment = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setAttachmentPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="message-input">
      {/* Attachments Preview */}
      {attachmentPreviews.length > 0 && (
        <div className="attachments-preview">
          <div className="attachments-header">
            <span className="attachments-count">
              {attachmentPreviews.length} file{attachmentPreviews.length > 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              onClick={clearAttachments}
              className="clear-all-attachments"
              disabled={isUploading}
            >
              Clear all
            </button>
          </div>
          <div className="attachments-grid">
            {attachmentPreviews.map((preview, index) => (
              <div key={index} className="attachment-preview">
                <div className="attachment-preview-content">
                  {preview.type === 'image' ? (
                    <div className="image-preview">
                      <img 
                        src={preview.url} 
                        alt="Preview" 
                        className="preview-image"
                      />
                      <div className="image-info">
                        <span className="file-name">{preview.name}</span>
                        <span className="file-size">{formatFileSize(preview.size)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="file-preview">
                      <FileText size={24} className="file-icon" />
                      <div className="file-info">
                        <span className="file-name">{preview.name}</span>
                        <span className="file-size">{formatFileSize(preview.size)}</span>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="remove-attachment"
                    disabled={isUploading}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="message-input-form">
        <button
          type="button"
          className="message-input-icon emoji-button"
          title="Add emoji"
        >
          <Smile size={20} />
        </button>

        <button
          type="button"
          className="message-input-icon attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          title="Attach files"
        >
          <Paperclip size={20} />
        </button>

        {/* Hidden file input - allow multiple files */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.doc,.docx"
          onChange={handleFileSelect}
          multiple
          style={{ display: 'none' }}
        />

        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => onSetMessage(e.target.value)}
          className="message-input-field"
          disabled={isUploading}
        />

        <button
          type="submit"
          disabled={(!message.trim() && selectedFiles.length === 0) || isUploading}
          className={`send-button ${
            (message.trim() || selectedFiles.length > 0) && !isUploading ? 'active' : 'disabled'
          }`}
          title={isUploading ? 'Uploading...' : 'Send message'}
        >
          {isUploading ? (
            <div className="spinner" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  );
}