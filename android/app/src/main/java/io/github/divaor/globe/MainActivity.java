package io.github.divaor.globe;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.MotionEvent;
import android.view.WindowManager;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * The screen's fastest refresh rate while the map is in your hands (v0.54.3). Many phones (Xiaomi's among them)
     * keep an app to 60 frames a second, or fewer when nothing moves, unless it asks for more; their browsers ask, so
     * the website ran at 120 and the app at 60 or 30. A touch asks for the fastest mode the screen has at its present
     * size, and the phone decides again three seconds after the last one (a fling and a flight to a place included),
     * so a still map costs no more battery than before.
     */
    private static final long FAST_FOR_MS = 3000;
    private int fastMode = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable relax = () -> setMode(0);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own theme first (v0.49.1): the window is built the moment edge-to-edge touches it, and with the
        // launch theme still on it came with a title bar ("Mundora" over the splash picture) above the page.
        setTheme(R.style.AppTheme_NoActionBar);
        // The page draws under the status and navigation bars and keeps clear of them itself (capacitor.config.ts).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        fastMode = findFastMode();
    }

    /** The mode with the most frames a second at the screen's present size, or 0 when none beats 60. */
    private int findFastMode() {
        try {
            Display d = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? getDisplay() : getWindowManager().getDefaultDisplay();
            if (d == null) return 0;
            Display.Mode now = d.getMode(), best = now;
            for (Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() != now.getPhysicalWidth() || m.getPhysicalHeight() != now.getPhysicalHeight()) continue;
                // From Android 12 the screen says which rates it changes to without a blink: only those.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && m.getModeId() != now.getModeId() && !seamless(now, m.getRefreshRate())) continue;
                if (m.getRefreshRate() > best.getRefreshRate() + 1) best = m;
            }
            return best.getRefreshRate() > 61 ? best.getModeId() : 0;
        } catch (RuntimeException e) {
            return 0;
        }
    }

    private static boolean seamless(Display.Mode mode, float rate) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        for (float r : mode.getAlternativeRefreshRates()) if (Math.abs(r - rate) < 1) return true;
        return false;
    }

    private void setMode(int id) {
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        if (lp.preferredDisplayModeId == id) return;
        lp.preferredDisplayModeId = id;
        getWindow().setAttributes(lp);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (fastMode != 0) {
            setMode(fastMode);
            handler.removeCallbacks(relax);
            handler.postDelayed(relax, FAST_FOR_MS);
        }
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public void onPause() {
        handler.removeCallbacks(relax);
        setMode(0);
        super.onPause();
    }
}
