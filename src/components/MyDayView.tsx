"use client";

import { useMyDayTasks } from "@/lib/hooks";
import { getUserById } from "@/lib/utils";
import { Task } from "@/types";
import TaskCard from "./TaskCard";
import { Star, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface MyDayViewProps {
  userId: string;
  onClickCard?: (task: Task) => void;
}

export default function MyDayView({ userId, onClickCard }: MyDayViewProps) {
  const { top3, more, upcoming } = useMyDayTasks(userId);
  const user = getUserById(userId);
  const [showMore, setShowMore] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
          My Day
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          {today} · {user?.name}
        </p>
      </div>

      {/* Top 3 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Star size={18} className="text-yellow-500 fill-yellow-500" />
          <h2 className="font-bold text-sm uppercase tracking-wider text-gray-700">
            Top 3 Today
          </h2>
        </div>

        {top3.length > 0 ? (
          <div className="space-y-3">
            {top3.map((task, i) => (
              <div key={task.id} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm"
                  style={{
                    backgroundColor:
                      i === 0 ? "#00BCD4" : i === 1 ? "#E91E63" : "#FFD600",
                  }}
                >
                  {i + 1}
                </span>
                <div className="flex-1">
                  <TaskCard task={task} onClickCard={onClickCard} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-xl text-gray-400">
            <p className="text-lg font-bold">All clear! 🎉</p>
            <p className="text-sm mt-1">No tasks due today</p>
          </div>
        )}
      </div>

      {/* More Today */}
      {more.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-2 mb-3 text-gray-500 hover:text-gray-800 transition-colors"
          >
            {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="font-bold text-sm uppercase tracking-wider">
              More Today
            </span>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
              {more.length}
            </span>
          </button>

          {showMore && (
            <div className="space-y-2 pl-6 sm:pl-11">
              {more.map((task) => (
                <TaskCard key={task.id} task={task} compact onClickCard={onClickCard} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <button
            onClick={() => setShowUpcoming(!showUpcoming)}
            className="flex items-center gap-2 mb-3 text-gray-500 hover:text-gray-800 transition-colors"
          >
            {showUpcoming ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
            <span className="font-bold text-sm uppercase tracking-wider">
              Upcoming
            </span>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
              {upcoming.length}
            </span>
          </button>

          {showUpcoming && (
            <div className="space-y-2 pl-6 sm:pl-11">
              {upcoming.map((task) => (
                <TaskCard key={task.id} task={task} compact onClickCard={onClickCard} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
