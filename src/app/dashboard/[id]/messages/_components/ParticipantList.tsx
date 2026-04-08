import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './mobile.scss';

export default function ParticipantList({
  participants,
  avatarColors
}: ParticipantListProps) {
  const [showParticipants, setShowParticipants] = useState(true);

  return (
    <div className="participants-list p-3 md:p-4 border-b border-gray-200 dark:border-gray-800">
      <div
        className="flex justify-between items-center mb-2 cursor-pointer"
        onClick={() => setShowParticipants(!showParticipants)}
      >
        <h3 className="font-medium text-sm md:text-base">People</h3>
        <ChevronDown
          className={`transform ${showParticipants ? '' : '-rotate-90'} transition-transform`}
          size={16}
        />
      </div>

      {showParticipants && (
        <div className="space-y-2">
          {participants.map((participant) => (
            <div key={participant.id} className="participant flex items-center gap-2">
              <div className="participant-avatar relative">
                <div
                  className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white ${avatarColors[participant.avatar]}`}
                >
                  <span className="text-xs md:text-sm">{participant.avatar}</span>
                </div>
                {participant.online && (
                  <div className="online-indicator absolute -bottom-0.5 -right-0.5 w-2 h-2 md:w-3 md:h-3 bg-green-500 rounded-full border border-white dark:border-gray-900"></div>
                )}
              </div>
              <div className="participant-info overflow-hidden">
                <p className="name text-xs md:text-sm text-gray-700 dark:text-gray-300 truncate">
                  {participant.email}
                </p>
                <p className="status text-xs text-gray-500">
                  {participant.online ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}