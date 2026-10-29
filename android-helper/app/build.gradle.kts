plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.forza.health"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.forza.health"
        minSdk = 28
        targetSdk = 35
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.0"
    }

    // Release builds are signed in CI with a keystore stored as GitHub secrets
    // (see .github/workflows/android-helper.yml). Without it, a debug build is produced.
    val keystore = System.getenv("FORZA_KEYSTORE_PATH")
    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore)
                storePassword = System.getenv("FORZA_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("FORZA_KEY_ALIAS") ?: "forza"
                keyPassword = System.getenv("FORZA_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystore != null) signingConfig = signingConfigs.getByName("release")
        }
    }
    // The Build With Science extractor is shared with Forza! Coach: copied from coach/lib at build time.
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/bws-assets").get().asFile)
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("androidx.activity:activity-ktx:1.12.4")
}

val copyBwsScripts by tasks.registering(Copy::class) {
    from(rootProject.file("../coach/lib")) { include("bws-extract.mjs", "bws-convert.mjs", "bws-dates.mjs", "sha1.mjs") }
    from(rootProject.file("../app/src/data")) { include("exercises.json") }
    into(layout.buildDirectory.dir("generated/bws-assets/bws"))
}
tasks.named("preBuild") { dependsOn(copyBwsScripts) }
