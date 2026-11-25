package io.github.toddla23.batangcalendar.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.util.Log;

import java.util.Calendar;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 위젯 갱신 (D-024): 1시간마다(시스템), 탭할 때, 앱을 닫고 돌아올 때.
 * 보이는 범위만 서버에서 받아 캐시에 합치고 모든 위젯을 다시 그린다. 폴링 타이머는 두지 않는다.
 */
public final class WidgetUpdater {
    private static final String TAG = "DeskcalWidget";
    private static final ExecutorService EXEC = Executors.newSingleThreadExecutor();
    /** 시스템 주기 갱신은 마지막으로 받은 지 이만큼 안 지났으면 건너뛴다 (두 종류 위젯이 각각 깨워도 한 번만) */
    private static final long PERIODIC_MIN_MS = 30 * 60_000L;
    /** 탭으로 갱신할 때 연속 탭 무시 */
    private static final long FORCE_MIN_MS = 5_000L;
    /** 다가오는 메모 위젯이 보여 주는 날 수 (오늘 포함, 서버 한도 62일 이하) */
    static final int UPCOMING_DAYS = 60;

    private WidgetUpdater() {}

    /** 위젯이 하나라도 있으면 받아 온다 (앱을 닫고 돌아올 때) */
    public static void refreshIfAny(Context ctx) {
        if (hasAnyWidget(ctx)) refresh(ctx, true, null);
    }

    /**
     * @param force 탭 등 사용자가 부른 갱신이면 true
     * @param done  끝나면 부른다 (BroadcastReceiver.goAsync 의 finish). null 가능
     */
    static void refresh(Context context, boolean force, Runnable done) {
        final Context ctx = context.getApplicationContext();
        EXEC.execute(() -> {
            try {
                fetch(ctx, force);
                renderAll(ctx);
            } catch (Throwable t) {
                Log.w(TAG, "위젯 갱신 실패", t);
            } finally {
                if (done != null) done.run();
            }
        });
    }

    /** 네트워크 없이 캐시로 다시 그리기만 */
    static void redraw(Context context, Runnable done) {
        final Context ctx = context.getApplicationContext();
        EXEC.execute(() -> {
            try {
                renderAll(ctx);
            } finally {
                if (done != null) done.run();
            }
        });
    }

    private static void fetch(Context ctx, boolean force) {
        WidgetStore store = new WidgetStore(ctx);
        String token = store.token();
        if (token == null) {
            store.setStatus(WidgetStore.STATUS_UNLINKED);
            return;
        }
        long now = System.currentTimeMillis();
        if (force ? now - store.lastAttempt() < FORCE_MIN_MS : now - store.lastFetch() < PERIODIC_MIN_MS) return;
        store.setLastAttempt(now);

        WidgetApi api = new WidgetApi(ctx);
        try {
            for (String[] r : neededRanges(ctx, store)) store.mergeRange(api.range(token, r[0], r[1]));
            store.setStatus(WidgetStore.STATUS_OK);
            store.setLastFetch(now);
        } catch (WidgetApi.Unauthorized e) {
            store.unlink();
        } catch (Exception e) {
            Log.i(TAG, "서버에 연결할 수 없음: " + e);
            store.setStatus(WidgetStore.STATUS_OFFLINE);
        }
    }

    /** 놓인 위젯들이 보여 주는 날짜 범위 (같은 범위는 한 번만) */
    private static Set<String[]> neededRanges(Context ctx, WidgetStore store) {
        Set<String> keys = new LinkedHashSet<>();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, MonthWidgetProvider.class))) {
            String[] cells = Dates.monthCells(Dates.monthStart(store.monthOffset(id)));
            keys.add(cells[0] + "|" + cells[41]);
        }
        if (mgr.getAppWidgetIds(new ComponentName(ctx, ListWidgetProvider.class)).length > 0) {
            String today = Dates.ymd(Dates.today());
            keys.add(today + "|" + Dates.addDays(today, UPCOMING_DAYS - 1));
        }
        Set<String[]> out = new LinkedHashSet<>();
        for (String k : keys) out.add(k.split("\\|"));
        return out;
    }

    static void renderAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] month = mgr.getAppWidgetIds(new ComponentName(ctx, MonthWidgetProvider.class));
        if (month.length > 0) MonthWidgetProvider.render(ctx, mgr, month);
        int[] list = mgr.getAppWidgetIds(new ComponentName(ctx, ListWidgetProvider.class));
        if (list.length > 0) ListWidgetProvider.render(ctx, mgr, list);
    }

    static boolean hasAnyWidget(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        return mgr.getAppWidgetIds(new ComponentName(ctx, MonthWidgetProvider.class)).length > 0
                || mgr.getAppWidgetIds(new ComponentName(ctx, ListWidgetProvider.class)).length > 0;
    }

    /** 마지막 위젯을 지우면 토큰을 서버에서도 폐기하고 캐시를 지운다 */
    static void onLastWidgetRemoved(Context context, Runnable done) {
        final Context ctx = context.getApplicationContext();
        EXEC.execute(() -> {
            try {
                if (hasAnyWidget(ctx)) return;
                WidgetStore store = new WidgetStore(ctx);
                String token = store.token();
                store.unlink();
                if (token != null) new WidgetApi(ctx).logout(token);
            } catch (Exception e) {
                Log.i(TAG, "위젯 토큰 폐기 실패 (90일 뒤 만료됨): " + e);
            } finally {
                if (done != null) done.run();
            }
        });
    }

    /** 상태 줄: "14:05 갱신", "오프라인 · 14:05 기준" */
    static String statusLine(WidgetStore store) {
        long at = store.lastFetch();
        String time = "";
        if (at > 0) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(at);
            Calendar today = Dates.today();
            boolean sameDay = c.get(Calendar.YEAR) == today.get(Calendar.YEAR)
                    && c.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR);
            time = (sameDay ? "" : (c.get(Calendar.MONTH) + 1) + "/" + c.get(Calendar.DAY_OF_MONTH) + " ")
                    + String.format(java.util.Locale.ROOT, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
        }
        if (WidgetStore.STATUS_OFFLINE.equals(store.status())) return time.isEmpty() ? "오프라인" : "오프라인 · " + time + " 기준";
        return time.isEmpty() ? "" : time + " 갱신";
    }
}
