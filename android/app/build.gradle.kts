plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Versi dasar dibaca dari android/VERSION; nomor urut build CI ditambahkan di belakangnya agar
// setiap APK bisa dibedakan di layar Pengaturan (mis. 3.2.17) dan di nama berkas hasil build.
val baseVersion: String = rootProject.file("VERSION").readText().trim()
val ciRun: String = System.getenv("GITHUB_RUN_NUMBER") ?: "0"

android {
    namespace = "com.tfael.omni.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tfael.omni.agent"
        minSdk = 24
        targetSdk = 34
        versionCode = 24
        versionName = "$baseVersion.$ciRun"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Framework + Kotlin stdlib, no AppCompat/Play Services (runs on bare AOSP).
    implementation("androidx.core:core-ktx:1.13.1")
    // Peta native OpenStreetMap (tanpa kunci API, cache ubin offline-friendly).
    implementation("org.osmdroid:osmdroid-android:6.1.18")
}
