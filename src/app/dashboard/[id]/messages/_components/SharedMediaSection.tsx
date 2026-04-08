// app/dashboard/[id]/messages/_components/SharedMediaSection.tsx
'use client';

import { ChevronDown, ChevronRight, Image, ExternalLink } from 'lucide-react';

interface SharedMedia {
  id: string;
  url: string;
  type: 'image' | 'file';
  name: string;
  size: number;
  created_at: string;
  sender_name: string;
}

interface SharedMediaSectionProps {
  sharedMedia: SharedMedia[];
  loadingMedia: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function SharedMediaSection({ 
  sharedMedia, 
  loadingMedia, 
  isCollapsed, 
  onToggle 
}: SharedMediaSectionProps) {
  
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleMediaClick = (media: SharedMedia) => {
    window.open(media.url, '_blank');
  };

  const getFileIcon = (name: string, type: string) => {
    if (type === 'image') return '🖼️';
    if (name.includes('.pdf')) return '📄';
    if (name.includes('.doc') || name.includes('.docx')) return '📝';
    if (name.includes('.xls') || name.includes('.xlsx')) return '📊';
    if (name.includes('.zip') || name.includes('.rar')) return '📦';
    return '📄';
  };

  return (
    <div style={{
      backgroundColor: 'hsl(var(--card))',
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          color: 'hsl(var(--foreground))',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--accent) / 0.5)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        aria-expanded={!isCollapsed}
        aria-label="Toggle shared media section"
      >
        <span>Shared Media ({sharedMedia.length})</span>
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
      
      {!isCollapsed && (
        <div style={{ 
          padding: '0 16px 16px 16px', 
          flex: 1,
          overflowY: 'auto'
        }}>
          {loadingMedia ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '20px',
              color: 'hsl(var(--muted-foreground))',
              fontSize: '14px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid hsl(var(--muted))',
                  borderTop: '2px solid hsl(var(--primary))',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                Loading media...
              </div>
            </div>
          ) : sharedMedia.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '20px',
              color: 'hsl(var(--muted-foreground))',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              <Image size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontWeight: '500' }}>No shared media yet</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                Images and files will appear here
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px'
            }}>
              {sharedMedia.map((media) => (
                <div
                  key={media.id}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-xs)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                  }}
                  onClick={() => handleMediaClick(media)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
                  }}
                  title={`${media.name} - ${formatFileSize(media.size)} - Shared by ${media.sender_name}`}
                >
                  {media.type === 'image' ? (
                    <img
                      src={media.url}
                      alt={media.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const parent = e.target.parentNode as HTMLElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div style="
                              width: 100%; 
                              height: 100%; 
                              background: hsl(var(--muted)); 
                              display: flex; 
                              flex-direction: column;
                              align-items: center; 
                              justify-content: center;
                              padding: 4px;
                            ">
                              <span style="color: hsl(var(--muted-foreground)); font-size: 20px;">📷</span>
                              <span style="
                                color: hsl(var(--muted-foreground)); 
                                font-size: 8px; 
                                text-align: center;
                                margin-top: 2px;
                              ">Failed to load</span>
                            </div>
                          `;
                        }
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'hsl(var(--muted))',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px'
                    }}>
                      <span style={{ fontSize: '16px', marginBottom: '2px' }}>
                        {getFileIcon(media.name, media.type)}
                      </span>
                      <span style={{
                        fontSize: '8px',
                        color: 'hsl(var(--muted-foreground))',
                        textAlign: 'center',
                        lineHeight: '1.2',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%',
                        fontWeight: '500'
                      }}>
                        {media.name.length > 10 ? media.name.substring(0, 10) + '...' : media.name}
                      </span>
                      <span style={{
                        fontSize: '7px',
                        color: 'hsl(var(--muted-foreground))',
                        textAlign: 'center',
                        marginTop: '1px',
                        opacity: 0.7
                      }}>
                        {formatFileSize(media.size)}
                      </span>
                    </div>
                  )}
                  
                  {/* Hover overlay */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                  >
                    <ExternalLink size={16} style={{ color: 'white' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Additional info footer */}
          {!loadingMedia && sharedMedia.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '8px',
              backgroundColor: 'hsl(var(--muted) / 0.3)',
              borderRadius: 'var(--radius)',
              textAlign: 'center'
            }}>
              <p style={{
                margin: 0,
                fontSize: '11px',
                color: 'hsl(var(--muted-foreground))'
              }}>
                {sharedMedia.length} item{sharedMedia.length !== 1 ? 's' : ''} shared
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* CSS for loading spinner */}
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}