import React, { useState, useEffect } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNotesStore } from '../store/notes';
import styles from './Calendar.module.css';

interface CalendarProps {
  onDateSelect: (date: string) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ onDateSelect }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { notes, selectedDate, setSelectedDate } = useNotesStore();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({
    start: monthStart,
    end: monthEnd,
  });

  const handleDateClick = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    setSelectedDate(dateStr);
    onDateSelect(dateStr);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const getHasNotes = (day: Date): boolean => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return (notes.get(dateStr)?.length ?? 0) > 0;
  };

  return (
    <div className={styles.calendar}>
      <div className={styles.header}>
        <button onClick={handlePrevMonth} className={styles.navButton}>
          ←
        </button>
        <h2 className={styles.title}>
          {format(currentMonth, 'MMMM yyyy', { locale: ko })}
        </h2>
        <button onClick={handleNextMonth} className={styles.navButton}>
          →
        </button>
      </div>

      <div className={styles.weekDays}>
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <div key={day} className={styles.weekDay}>
            {day}
          </div>
        ))}
      </div>

      <div className={styles.days}>
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isCurrentDay = isToday(day);
          const isSelected = dateStr === selectedDate;
          const hasNotes = getHasNotes(day);

          return (
            <button
              key={dateStr}
              onClick={() => handleDateClick(day)}
              className={`${styles.day} ${
                !isCurrentMonth ? styles.otherMonth : ''
              } ${isCurrentDay ? styles.today : ''} ${
                isSelected ? styles.selected : ''
              }`}
              disabled={!isCurrentMonth}
            >
              <span className={styles.dayNumber}>{format(day, 'd')}</span>
              {hasNotes && <div className={styles.dot} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
