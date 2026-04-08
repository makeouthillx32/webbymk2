// components/documents/CopyUrlModal/index.tsx
'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Link, Code, FileText } from 'lucide-react';
import { 
  generateDocumentUrls, 
  copyUrlToClipboard,
  generateImageTag,
  generateMarkdownImage,
  generateAllFormatsText,
  type UrlFormat 
} from '@/lib/document-urls';
import './styles.scss';

interface CopyUrlModalProps {
  isOpen: boolean;
  document: {
    id: string;
    name: string;
    path: string;
    parent_path?: string | null;
    storage_path?: string | null;
    mime_type?: string | null;
  };
  onClose: () => void;
}

export default function CopyUrlModal({ isOpen, document, onClose }: CopyUrlModalProps) {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  
  if (!isOpen) return null;
  
  const urls = generateDocumentUrls(document);
  const isImage = document.mime_type?.startsWith('image/');
  
  const handleCopy = async (url: string, format: string) => {
    const success = await copyUrlToClipboard(url);
    if (success) {
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    }
  };
  
  const handleCopyImageTag = async () => {
    const tag = generateImageTag(document, 'cdn');
    const success = await copyUrlToClipboard(tag);
    if (success) {
      setCopiedFormat('html');
      setTimeout(() => setCopiedFormat(null), 2000);
    }
  };
  
  const handleCopyMarkdown = async () => {
    const markdown = generateMarkdownImage(document, 'cdn');
    const success = await copyUrlToClipboard(markdown);
    if (success) {
      setCopiedFormat('markdown');
      setTimeout(() => setCopiedFormat(null), 2000);
    }
  };
  
  const handleCopyAll = async () => {
    const allText = generateAllFormatsText(document);
    const success = await copyUrlToClipboard(allText);
    if (success) {
      setCopiedFormat('all');
      setTimeout(() => setCopiedFormat(null), 2000);
    }
  };
  
  return (
    <div className="copy-url-modal-overlay" onClick={onClose}>
      <div className="copy-url-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="copy-url-modal-header">
          <div className="copy-url-modal-title">
            <Link className="h-5 w-5" />
            <h3>Copy URL</h3>
          </div>
          <button onClick={onClose} className="copy-url-modal-close">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Document Info */}
        <div className="copy-url-modal-info">
          <p className="document-name">{document.name}</p>
          <p className="document-path">{document.path}</p>
        </div>
        
        {/* URL Formats */}
        <div className="copy-url-modal-content">
          <h4 className="section-title">URL Formats</h4>
          
          {Object.entries(urls).map(([format, { url, label, description }]) => (
            <div key={format} className="url-option">
              <div className="url-option-header">
                <div>
                  <p className="url-label">{label}</p>
                  <p className="url-description">{description}</p>
                </div>
                <button
                  onClick={() => handleCopy(url, format)}
                  className={`copy-btn ${copiedFormat === format ? 'copied' : ''}`}
                >
                  {copiedFormat === format ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="url-display">
                <code>{url}</code>
              </div>
            </div>
          ))}
          
          {/* Image-specific formats */}
          {isImage && (
            <>
              <h4 className="section-title">Code Snippets</h4>
              
              {/* HTML Tag */}
              <div className="url-option">
                <div className="url-option-header">
                  <div>
                    <p className="url-label">HTML Image Tag</p>
                    <p className="url-description">Ready to paste in HTML</p>
                  </div>
                  <button
                    onClick={handleCopyImageTag}
                    className={`copy-btn ${copiedFormat === 'html' ? 'copied' : ''}`}
                  >
                    {copiedFormat === 'html' ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Code className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="url-display">
                  <code>{generateImageTag(document, 'cdn')}</code>
                </div>
              </div>
              
              {/* Markdown */}
              <div className="url-option">
                <div className="url-option-header">
                  <div>
                    <p className="url-label">Markdown</p>
                    <p className="url-description">For README, docs, etc.</p>
                  </div>
                  <button
                    onClick={handleCopyMarkdown}
                    className={`copy-btn ${copiedFormat === 'markdown' ? 'copied' : ''}`}
                  >
                    {copiedFormat === 'markdown' ? (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="url-display">
                  <code>{generateMarkdownImage(document, 'cdn')}</code>
                </div>
              </div>
            </>
          )}
          
          {/* Copy All */}
          <div className="copy-all-section">
            <button
              onClick={handleCopyAll}
              className={`copy-all-btn ${copiedFormat === 'all' ? 'copied' : ''}`}
            >
              {copiedFormat === 'all' ? (
                <>
                  <Check className="h-5 w-5" />
                  <span>All Formats Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-5 w-5" />
                  <span>Copy All Formats</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}