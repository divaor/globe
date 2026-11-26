package io.github.divaor.globe;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own theme first (v0.49.1): the window is built the moment edge-to-edge touches it, and with the
        // launch theme still on it came with a title bar ("Mundora" over the splash picture) above the page.
        setTheme(R.style.AppTheme_NoActionBar);
        // The page draws under the status and navigation bars and keeps clear of them itself (capacitor.config.ts).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
