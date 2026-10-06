param(
    [string]$Database = "tryonbd",
    [string]$Sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
)
$ErrorActionPreference = "Stop"
$gradleCache = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path $env:USERPROFILE ".gradle" }
$driver = Get-ChildItem (Join-Path $gradleCache "caches/modules-2/files-2.1/org.postgresql/postgresql") -Recurse -Filter "*.jar" |
    Where-Object { $_.Name -notmatch "-(sources|javadoc)\.jar$" } | Select-Object -First 1
if (-not $driver) { throw "Run .\gradlew.bat bootJar first to download the PostgreSQL JDBC driver." }
& java --class-path $driver.FullName (Join-Path $PSScriptRoot "tools/DatabaseCli.java") $Database $Sql
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL SQL command failed." }
