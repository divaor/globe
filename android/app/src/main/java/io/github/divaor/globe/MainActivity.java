package io.github.divaor.globe;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The page draws under the status and navigation bars and keeps clear of them itself (capacitor.config.ts).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
