package io.github.toddla23.batangcalendar.widget;

import java.util.Calendar;
import java.util.Locale;

/** 날짜 문자열(YYYY-MM-DD) 도우미. minSdk 24 라 java.time 을 쓰지 않는다. */
final class Dates {
    private Dates() {}

    static final String[] DOW = {"일", "월", "화", "수", "목", "금", "토"};

    static String ymd(Calendar c) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static Calendar today() {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c;
    }

    static Calendar parse(String ymd) {
        Calendar c = today();
        c.set(Integer.parseInt(ymd.substring(0, 4)), Integer.parseInt(ymd.substring(5, 7)) - 1,
                Integer.parseInt(ymd.substring(8, 10)));
        return c;
    }

    static String addDays(String ymd, int days) {
        Calendar c = parse(ymd);
        c.add(Calendar.DAY_OF_MONTH, days);
        return ymd(c);
    }

    /** 오늘이 속한 달에서 offset 달만큼 옮긴 달의 1일 */
    static Calendar monthStart(int offset) {
        Calendar c = today();
        c.set(Calendar.DAY_OF_MONTH, 1);
        c.add(Calendar.MONTH, offset);
        return c;
    }

    /** 일요일 시작 6주(42칸). 웹 dates.ts monthCells 와 같다 */
    static String[] monthCells(Calendar first) {
        Calendar c = (Calendar) first.clone();
        c.add(Calendar.DAY_OF_MONTH, -(c.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY));
        String[] out = new String[42];
        for (int i = 0; i < 42; i++) {
            out[i] = ymd(c);
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        return out;
    }

    /** 0=일 … 6=토 */
    static int dow(String ymd) {
        return parse(ymd).get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY;
    }
}
