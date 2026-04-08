import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Image from 'next/image';
import './mobile.scss';

export default function PhotoGallery({ messages }: PhotoGalleryProps) {
  const [showPhotos, setShowPhotos] = useState(true);

  const imageMessages = messages.filter((msg) => msg.image);

  return (
    <div className="media-gallery p-3 md:p-4">
      <div
        className="flex justify-between items-center mb-2 cursor-pointer"
        onClick={() => setShowPhotos(!showPhotos)}
      >
        <h3 className="font-medium text-sm md:text-base">Photos</h3>
        <ChevronDown
          className={`transform ${showPhotos ? '' : '-rotate-90'} transition-transform`}
          size={16}
        />
      </div>

      {showPhotos && (
        <div className="media-gallery-grid grid grid-cols-3 gap-1 md:gap-2">
          {imageMessages.length > 0 ? (
            imageMessages.map((msg) => (
              <div
                key={msg.id}
                className="message-image aspect-square rounded overflow-hidden border border-gray-200 dark:border-gray-700"
              >
                <Image
                  src={msg.image || ''}
                  alt="Shared photo"
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                  priority={false}
                />
              </div>
            ))
          ) : (
            <div className="col-span-3 text-center py-2 text-xs md:text-sm text-gray-500">
              No photos shared yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}