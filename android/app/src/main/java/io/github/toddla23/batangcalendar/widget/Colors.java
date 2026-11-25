package io.github.toddla23.batangcalendar.widget;

import io.github.toddla23.batangcalendar.R;

/** 칸 색 이름(protocol.ts COLORS) → 위젯 drawable. 색값은 웹 styles.css 의 --c-* 와 같다 (values-night 에 다크) */
final class Colors {
    private Colors() {}

    static int cellBackground(String color) {
        if (color == null) return 0;
        switch (color) {
            case "red": return R.drawable.widget_note_red;
            case "orange": return R.drawable.widget_note_orange;
            case "yellow": return R.drawable.widget_note_yellow;
            case "green": return R.drawable.widget_note_green;
            case "blue": return R.drawable.widget_note_blue;
            case "purple": return R.drawable.widget_note_purple;
            case "gray": return R.drawable.widget_note_gray;
            default: return 0;
        }
    }
}
