param(
  [string]$AdminEmail,
  [string]$AdminPassword,
  [string]$BaseUrl = 'http://localhost:4020/api'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AdminEmail) -or [string]::IsNullOrWhiteSpace($AdminPassword)) {
  throw 'AdminEmail and AdminPassword are required.'
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers,
    $Body = $null
  )
  $uri = "$BaseUrl$Path"
  try {
    if ($null -ne $Body) {
      $json = $Body | ConvertTo-Json -Depth 20
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -ContentType 'application/json' -Body $json
    } else {
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
    }
    return @{ status = 200; data = $resp; raw = $null }
  } catch {
    $ex = $_.Exception
    if ($ex.Response) {
      $status = [int]$ex.Response.StatusCode
      $sr = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
      $raw = $sr.ReadToEnd()
      $sr.Close()
      $parsed = $null
      try { $parsed = $raw | ConvertFrom-Json } catch {}
      return @{ status = $status; data = $parsed; raw = $raw }
    }
    throw
  }
}

function Assert-Status([string]$Name, [int]$Expected, $Result) {
  if ($Result.status -ne $Expected) {
    throw "FAIL [$Name] expected $Expected got $($Result.status). Body: $($Result.raw)"
  }
  Write-Host "PASS [$Name]"
}

function Login([string]$identifier, [string]$password) {
  $r = Invoke-Api -Method 'POST' -Path '/auth/local' -Headers @{} -Body @{ identifier = $identifier; password = $password }
  Assert-Status -Name "login $identifier" -Expected 200 -Result $r
  return $r.data.jwt
}

$adminJwt = Login -identifier $AdminEmail -password $AdminPassword
$authHeaders = @{ Authorization = "Bearer $adminJwt"; 'X-Rutba-App' = 'auth'; 'X-Rutba-App-Admin' = 'auth' }

$rolesRes = Invoke-Api -Method 'GET' -Path '/auth-admin/roles' -Headers $authHeaders
Assert-Status -Name 'load roles' -Expected 200 -Result $rolesRes
$roles = @($rolesRes.data.roles)
$appRole = $roles | Where-Object { $_.type -eq 'rutba_app_user' } | Select-Object -First 1
$webRole = $roles | Where-Object { $_.type -eq 'rutba_web_user' } | Select-Object -First 1
if (-not $appRole -or -not $webRole) { throw 'Missing rutba_app_user or rutba_web_user role' }

$appRes = Invoke-Api -Method 'GET' -Path '/app-accesses' -Headers $authHeaders
Assert-Status -Name 'load app-accesses' -Expected 200 -Result $appRes
$appAccesses = @($appRes.data.data)

function Get-AppId([string]$key) {
  $a = $appAccesses | Where-Object { $_.key -eq $key } | Select-Object -First 1
  if (-not $a) { throw "Missing app access key: $key" }
  return [int]$a.id
}

$scenarios = @(
  @{ app='web-user'; role='rutba_web_user'; allow='/sale-orders?pagination[pageSize]=1'; deny='/cms-pages?pagination[pageSize]=1' },
  @{ app='crm'; role='rutba_app_user'; allow='/crm-contacts?pagination[pageSize]=1'; deny='/cms-pages?pagination[pageSize]=1' },
  @{ app='cms'; role='rutba_app_user'; allow='/cms-pages?pagination[pageSize]=1'; deny='/crm-contacts?pagination[pageSize]=1' },
  @{ app='sale'; role='rutba_app_user'; allow='/sales?pagination[pageSize]=1'; deny='/purchases?pagination[pageSize]=1' },
  @{ app='stock'; role='rutba_app_user'; allow='/stock-items/orphan-groups?page=1&pageSize=1'; deny='/sales?pagination[pageSize]=1' }
)

$created = @()
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

foreach ($s in $scenarios) {
  $appId = Get-AppId $s.app
  $roleId = if ($s.role -eq 'rutba_web_user') { [int]$webRole.id } else { [int]$appRole.id }

  $uName = "proxy.user.$($s.app).$suffix"
  $aName = "proxy.admin.$($s.app).$suffix"
  $pwd = 'Passw0rd!123'

  $uCreate = Invoke-Api -Method 'POST' -Path '/auth-admin/users' -Headers $authHeaders -Body @{
    username = $uName
    displayName = "U $($s.app)"
    email = "$uName@example.test"
    password = $pwd
    confirmed = $true
    blocked = $false
    role = $roleId
    app_accesses = @($appId)
    admin_app_accesses = @()
  }
  Assert-Status -Name "create user $($s.app)" -Expected 200 -Result $uCreate
  $userId = [int]$uCreate.data.id
  $created += $userId

  $aCreate = Invoke-Api -Method 'POST' -Path '/auth-admin/users' -Headers $authHeaders -Body @{
    username = $aName
    displayName = "A $($s.app)"
    email = "$aName@example.test"
    password = $pwd
    confirmed = $true
    blocked = $false
    role = $roleId
    app_accesses = @($appId)
    admin_app_accesses = @($appId)
  }
  Assert-Status -Name "create admin $($s.app)" -Expected 200 -Result $aCreate
  $adminId = [int]$aCreate.data.id
  $created += $adminId

  $userJwt = Login -identifier "$uName@example.test" -password $pwd
  $adminJwtLocal = Login -identifier "$aName@example.test" -password $pwd

  $userHeaders = @{ Authorization = "Bearer $userJwt"; 'X-Rutba-App' = $s.app }
  $adminHeaders = @{ Authorization = "Bearer $adminJwtLocal"; 'X-Rutba-App' = $s.app; 'X-Rutba-App-Admin' = $s.app }

  $allowUser = Invoke-Api -Method 'GET' -Path $s.allow -Headers $userHeaders
  Assert-Status -Name "allow user $($s.app) $($s.allow)" -Expected 200 -Result $allowUser

  $allowAdmin = Invoke-Api -Method 'GET' -Path $s.allow -Headers $adminHeaders
  Assert-Status -Name "allow admin $($s.app) $($s.allow)" -Expected 200 -Result $allowAdmin

  $denyUser = Invoke-Api -Method 'GET' -Path $s.deny -Headers $userHeaders
  Assert-Status -Name "deny user $($s.app) $($s.deny)" -Expected 403 -Result $denyUser

  $denyAdmin = Invoke-Api -Method 'GET' -Path $s.deny -Headers $adminHeaders
  Assert-Status -Name "deny admin $($s.app) $($s.deny)" -Expected 403 -Result $denyAdmin

  if ($s.app -eq 'cms') {
    $drop = Invoke-Api -Method 'PUT' -Path "/auth-admin/users/$userId" -Headers $authHeaders -Body @{
      username = $uName
      displayName = "U $($s.app)"
      email = "$uName@example.test"
      confirmed = $true
      blocked = $false
      role = $roleId
      app_accesses = @()
      admin_app_accesses = @()
    }
    Assert-Status -Name 'remove cms app access' -Expected 200 -Result $drop

    $afterDrop = Invoke-Api -Method 'GET' -Path $s.allow -Headers $userHeaders
    Assert-Status -Name 'cms user denied after app_access removal' -Expected 403 -Result $afterDrop

    $restore = Invoke-Api -Method 'PUT' -Path "/auth-admin/users/$userId" -Headers $authHeaders -Body @{
      username = $uName
      displayName = "U $($s.app)"
      email = "$uName@example.test"
      confirmed = $true
      blocked = $false
      role = $roleId
      app_accesses = @($appId)
      admin_app_accesses = @()
    }
    Assert-Status -Name 'restore cms app access' -Expected 200 -Result $restore

    $afterRestore = Invoke-Api -Method 'GET' -Path $s.allow -Headers $userHeaders
    Assert-Status -Name 'cms user allowed after app_access restore' -Expected 200 -Result $afterRestore
  }
}

Write-Host 'Cleaning up created users...'
$created | ForEach-Object {
  $d = Invoke-Api -Method 'DELETE' -Path "/auth-admin/users/$_" -Headers $authHeaders
  if ($d.status -ne 200) { Write-Host "WARN failed deleting user $_" }
}

Write-Host 'Proxy route-level app-user checks passed for web-user, crm, cms, sale, stock.' -ForegroundColor Green
