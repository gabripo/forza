package app.forza.health

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/** Explains what health data is read and where it goes (required by Health Connect). */
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.rgb(250, 247, 242))
            addView(TextView(this@PrivacyActivity).apply {
                setPadding(pad, pad * 2, pad, pad)
                textSize = 17f
                setTextColor(Color.rgb(28, 25, 23))
                text = getString(R.string.privacy)
            })
        })
    }
}
