package com.solanamobile.cutekittens

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Surface
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.solanamobile.cutekittens.ui.theme.CuteKittensTheme
import java.lang.Math.random
import kotlin.math.ceil

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val random = random()
        val width = ceil(1920.0 * random).toInt()
        val height = ceil(1080.0 * random).toInt()

        setContent {
            CuteKittensTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colors.background
                ) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        AsyncImage(
                            modifier = Modifier.fillMaxWidth(),
                            model = ImageRequest.Builder(LocalContext.current)
                                .data("https://placekitten.com/$width/$height")
                                .crossfade(true)
                                .build(),
                            contentDescription = "Kitttens",
                            contentScale = ContentScale.Fit,
                        )
                    }
                }
            }
        }
    }
}