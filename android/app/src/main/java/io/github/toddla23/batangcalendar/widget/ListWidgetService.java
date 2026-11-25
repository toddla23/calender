package io.github.toddla23.batangcalendar.widget;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

import io.github.toddla23.batangcalendar.R;

/** 다가오는 메모 위젯의 목록 항목을 캐시에서 만든다 (네트워크는 쓰지 않음) */
public class ListWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    private static final class Item {
        final String date;
        final String label;
        final String holiday;
        final String text;
        final String color;

        Item(String date, String label, String holiday, String text, String color) {
            this.date = date;
            this.label = label;
            this.holiday = holiday;
            this.text = text;
            this.color = color;
        }
    }

    private static final class Factory implements RemoteViewsFactory {
        private static final int MAX_ITEMS = 100;
        private final Context ctx;
        private final List<Item> items = new ArrayList<>();

        Factory(Context ctx) {
            this.ctx = ctx;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            items.clear();
            WidgetStore store = new WidgetStore(ctx);
            if (WidgetStore.STATUS_UNLINKED.equals(store.status())) return;
            JSONObject cache = store.cache();
            JSONObject notes = cache.optJSONObject("notes");
            JSONObject hols = cache.optJSONObject("holidays");
            if (notes == null) return;
            String today = Dates.ymd(Dates.today());
            String tomorrow = Dates.addDays(today, 1);
            for (int i = 0; i < WidgetUpdater.UPCOMING_DAYS && items.size() < MAX_ITEMS; i++) {
                String d = Dates.addDays(today, i);
                JSONObject n = notes.optJSONObject(d);
                if (n == null) continue;
                String label = Integer.parseInt(d.substring(5, 7)) + "/" + Integer.parseInt(d.substring(8))
                        + " (" + Dates.DOW[Dates.dow(d)] + ")"
                        + (d.equals(today) ? " 오늘" : d.equals(tomorrow) ? " 내일" : "");
                String text = n.optString("t", "").trim();
                items.add(new Item(d, label, hols == null ? "" : hols.optString(d, ""), text.isEmpty() ? "(색만 표시)" : text,
                        n.optString("c", null)));
            }
        }

        @Override
        public void onDestroy() {
            items.clear();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_list_item);
            if (position >= items.size()) return rv;
            Item it = items.get(position);
            int dow = Dates.dow(it.date);
            rv.setTextViewText(R.id.date, it.label);
            MonthWidgetProvider.textColor(ctx, rv, R.id.date,
                    !it.holiday.isEmpty() || dow == 0 ? R.color.widget_sun : dow == 6 ? R.color.widget_sat : R.color.widget_text);
            rv.setTextViewText(R.id.holiday, it.holiday);
            rv.setTextViewText(R.id.text, it.text);
            rv.setInt(R.id.item, "setBackgroundResource",
                    it.color == null ? R.drawable.widget_item_plain : Colors.cellBackground(it.color));
            rv.setOnClickFillInIntent(R.id.item, new Intent().putExtra(WidgetIntents.EXTRA_DATE, it.date));
            return rv;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position < items.size() ? items.get(position).date.hashCode() : position;
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }
    }
}
