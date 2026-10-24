import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import javax.inject.Inject
import org.gradle.process.ExecOperations

abstract class BuildTask : DefaultTask() {
    @get:Inject
    abstract val execOperations: ExecOperations

    @Input
    var rootDirRel: String? = null
    @Input
    var projectDir: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val currentTarget = target ?: "aarch64"
        val isRelease = release ?: false
        val abi = when (currentTarget) {
            "aarch64" -> "arm64-v8a"
            "armv7" -> "armeabi-v7a"
            "x86_64" -> "x86_64"
            "i686" -> "x86"
            else -> currentTarget
        }
        val triple = when (currentTarget) {
            "aarch64" -> "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "x86_64" -> "x86_64-linux-android"
            "i686" -> "i686-linux-android"
            else -> currentTarget
        }
        val profileDir = if (isRelease) "release" else "debug"
        val cargoTarget = File(projectDir, "../../../target/$triple/$profileDir/libtauri_app_lib.so")
        val dest = File(projectDir, "src/main/jniLibs/$abi/libtauri_app_lib.so")

        if (cargoTarget.exists()) {
            dest.parentFile.mkdirs()
            cargoTarget.copyTo(dest, overwrite = true)
            logger.lifecycle("Found prebuilt library: copied ${cargoTarget.path} to ${dest.path}")
            return
        }

        val executable = """npm""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )

                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");

        execOperations.exec {
            workingDir(File(projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
