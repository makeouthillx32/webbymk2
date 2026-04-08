// components/documents/DragDropUpload/index.tsx
"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import "./styles.scss";

interface DragDropUploadProps {
  onFilesDropped: (files: File[]) => void;
  children: React.ReactNode;
}

export default function DragDropUpload({ onFilesDropped, children }: DragDropUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter(prev => prev + 1);
    
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragCounter(prev => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    setDragCounter(0);
    
    const files = Array.from(e.dataTransfer.files);
    
    if (files.length > 0) {
      onFilesDropped(files);
    }
  }, [onFilesDropped]);

  return (
    <div
      className="drag-drop-upload-wrapper"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <Upload size={64} strokeWidth={1.5} />
            <div className="drag-overlay-text">
              <h3>Drop files to upload</h3>
              <p>Release to start uploading</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}