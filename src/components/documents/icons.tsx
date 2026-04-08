import React from 'react';
import { 
  File, 
  Folder, 
  Image, 
  FileText, 
  Video, 
  Music, 
  Archive,
  Code,
  Database,
  Presentation,
  Sheet
} from 'lucide-react';

interface FileIconProps {
  mimeType?: string;
  fileName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
};

export function FileIcon({ mimeType, fileName, size = 'md', className = '' }: FileIconProps) {
  const sizeClass = sizeClasses[size];
  const iconClass = `${sizeClass} ${className}`;

  // Determine icon based on MIME type or file extension
  const getIcon = () => {
    if (!mimeType && !fileName) {
      return <File className={iconClass} />;
    }

    // Get file extension from filename
    const extension = fileName?.toLowerCase().split('.').pop() || '';
    const mime = mimeType?.toLowerCase() || '';

    // Images
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(extension)) {
      return <Image className={`${iconClass} text-green-500`} />;
    }

    // Videos
    if (mime.startsWith('video/') || ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(extension)) {
      return <Video className={`${iconClass} text-purple-500`} />;
    }

    // Audio
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(extension)) {
      return <Music className={`${iconClass} text-pink-500`} />;
    }

    // PDFs
    if (mime.includes('pdf') || extension === 'pdf') {
      return <FileText className={`${iconClass} text-red-500`} />;
    }

    // Microsoft Word
    if (mime.includes('word') || mime.includes('msword') || ['doc', 'docx'].includes(extension)) {
      return <FileText className={`${iconClass} text-blue-600`} />;
    }

    // Microsoft Excel
    if (mime.includes('excel') || mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(extension)) {
      return <Sheet className={`${iconClass} text-green-600`} />;
    }

    // Microsoft PowerPoint
    if (mime.includes('presentation') || ['ppt', 'pptx'].includes(extension)) {
      return <Presentation className={`${iconClass} text-orange-500`} />;
    }

    // Code files
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'sass', 'json', 'xml', 'yml', 'yaml', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'sql'].includes(extension)) {
      return <Code className={`${iconClass} text-blue-500`} />;
    }

    // Archives
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(extension)) {
      return <Archive className={`${iconClass} text-yellow-600`} />;
    }

    // Database
    if (['db', 'sqlite', 'sqlite3', 'mdb'].includes(extension)) {
      return <Database className={`${iconClass} text-gray-600`} />;
    }

    // Text files
    if (mime.startsWith('text/') || ['txt', 'md', 'rtf'].includes(extension)) {
      return <FileText className={`${iconClass} text-gray-500`} />;
    }

    // Default
    return <File className={iconClass} />;
  };

  return getIcon();
}

interface FolderIconProps {
  isOpen?: boolean;
  isFavorite?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function FolderIcon({ isOpen = false, isFavorite = false, size = 'md', className = '' }: FolderIconProps) {
  const sizeClass = sizeClasses[size];
  const iconClass = `${sizeClass} ${className}`;

  if (isFavorite) {
    return <Folder className={`${iconClass} text-yellow-500 fill-yellow-100 dark:fill-yellow-900`} />;
  }

  return <Folder className={`${iconClass} text-blue-500 ${isOpen ? 'fill-blue-100 dark:fill-blue-900' : ''}`} />;
}

// Specific branded icons for better recognition
export function PdfIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-red-500 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      PDF
    </div>
  );
}

export function WordIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-blue-600 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      DOC
    </div>
  );
}

export function ExcelIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-green-600 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      XLS
    </div>
  );
}

export function PowerPointIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-orange-500 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      PPT
    </div>
  );
}

export function ImageIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-green-500 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      IMG
    </div>
  );
}

export function VideoIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-purple-500 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      VID
    </div>
  );
}

export function AudioIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-pink-500 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      AUD
    </div>
  );
}

export function ArchiveIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-yellow-600 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      ZIP
    </div>
  );
}

export function CodeIcon({ size = 'md', className = '' }: Omit<FileIconProps, 'mimeType' | 'fileName'>) {
  const sizeClass = sizeClasses[size];
  return (
    <div className={`${sizeClass} ${className} bg-blue-500 rounded-sm flex items-center justify-center text-white text-xs font-bold`}>
      CODE
    </div>
  );
}

// Helper function to get the appropriate branded icon
export function getBrandedIcon(mimeType?: string, fileName?: string, size: 'sm' | 'md' | 'lg' | 'xl' = 'md', className = '') {
  if (!mimeType && !fileName) {
    return <FileIcon size={size} className={className} />;
  }

  const extension = fileName?.toLowerCase().split('.').pop() || '';
  const mime = mimeType?.toLowerCase() || '';

  // Use branded icons for common file types
  if (mime.includes('pdf') || extension === 'pdf') {
    return <PdfIcon size={size} className={className} />;
  }

  if (mime.includes('word') || mime.includes('msword') || ['doc', 'docx'].includes(extension)) {
    return <WordIcon size={size} className={className} />;
  }

  if (mime.includes('excel') || mime.includes('spreadsheet') || ['xls', 'xlsx'].includes(extension)) {
    return <ExcelIcon size={size} className={className} />;
  }

  if (mime.includes('presentation') || ['ppt', 'pptx'].includes(extension)) {
    return <PowerPointIcon size={size} className={className} />;
  }

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
    return <ImageIcon size={size} className={className} />;
  }

  if (mime.startsWith('video/') || ['mp4', 'avi', 'mkv', 'mov'].includes(extension)) {
    return <VideoIcon size={size} className={className} />;
  }

  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac'].includes(extension)) {
    return <AudioIcon size={size} className={className} />;
  }

  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) {
    return <ArchiveIcon size={size} className={className} />;
  }

  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'java'].includes(extension)) {
    return <CodeIcon size={size} className={className} />;
  }

  // Fall back to generic icon
  return <FileIcon mimeType={mimeType} fileName={fileName} size={size} className={className} />;
}

export default {
  FileIcon,
  FolderIcon,
  PdfIcon,
  WordIcon,
  ExcelIcon,
  PowerPointIcon,
  ImageIcon,
  VideoIcon,
  AudioIcon,
  ArchiveIcon,
  CodeIcon,
  getBrandedIcon
};