import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Note } from '../types/Note';

interface CalendarViewProps {
  notes: Note[];
  onDateSelect: (date: Date) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  notes,
  onDateSelect,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getNoteCount = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const dateStr = date.toDateString();
    return notes.filter((n) => {
      const noteDate = new Date(n.date || n.createdAt).toDateString();
      return noteDate === dateStr;
    }).length;
  };

  const renderCalendarDay = (day: number) => {
    const noteCount = getNoteCount(day);
    const hasNotes = noteCount > 0;

    return (
      <TouchableOpacity
        key={day}
        style={[styles.dayCell, hasNotes && styles.dayCellActive]}
        onPress={() => {
          const selectedDate = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            day
          );
          onDateSelect(selectedDate);
        }}
      >
        <Text style={styles.dayText}>{day}</Text>
        {hasNotes && (
          <View style={styles.noteIndicator}>
            <Text style={styles.noteCount}>{noteCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days = [];

  // Add empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
  }

  // Add days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(renderCalendarDay(i));
  }

  const goToPreviousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
    );
  };

  const goToNextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
    );
  };

  const monthYear = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goToPreviousMonth}>
          <Text style={styles.navButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.monthYear}>{monthYear}</Text>
        <TouchableOpacity onPress={goToNextMonth}>
          <Text style={styles.navButton}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekdaysHeader}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <Text key={day} style={styles.weekdayText}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.daysGrid}>
        {days.map((day, index) => (
          <View key={index} style={styles.dayCellWrapper}>
            {day}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    fontSize: 20,
    color: '#4285F4',
    fontWeight: 'bold',
    paddingHorizontal: 12,
  },
  monthYear: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  weekdaysHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    flex: 1,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellWrapper: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 4,
  },
  dayCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#F9F9F9',
    position: 'relative',
  },
  dayCellActive: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  noteIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteCount: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: 'bold',
  },
});
