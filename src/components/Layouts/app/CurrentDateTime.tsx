"use client";

import { useEffect, useState } from "react";
import { DropdownMenuItem } from "./dropdown-menu";

const CurrentDateTime: React.FC = () => {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <DropdownMenuItem>
      <span className="text-xs">
        {currentDateTime.toLocaleDateString()}{" "}
        {currentDateTime.toLocaleTimeString()}
      </span>
    </DropdownMenuItem>
  );
};

export default CurrentDateTime;