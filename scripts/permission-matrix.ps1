param(
  [string]$AdminEmail,
  [string]$AdminPassword
)

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4010/api'

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
  $uri = "$base$Path"
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
  $attempt = 0
  $maxAttempts = 8
  while ($attempt -lt $maxAttempts) {
    $attempt++
    $r = Invoke-Api -Method 'POST' -Path '/auth/local' -Headers @{} -Body @{ identifier = $identifier; password = $password }
    if ($r.status -eq 200) {
      Write-Host "PASS [login $identifier]"
      Start-Sleep -Milliseconds 400
      return $r.data.jwt
    }
    if ($r.status -eq 429 -and $attempt -lt $maxAttempts) {
      Start-Sleep -Seconds ([Math]::Min(8 + (2 * $attempt), 20))
      continue
    }
    Assert-Status -Name "login $identifier" -Expected 200 -Result $r
  }
  throw "FAIL [login $identifier] max retries reached"
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

$matrix = @(
  @{ app='stock'; user='api::product.product.find'; admin='api::stock-report.stock-report.find'; role='rutba_app_user' },
  @{ app='order-management'; user='api::sale-order.sale-order.find'; admin='api::delivery-config.delivery-config.find'; role='rutba_app_user' },
  @{ app='sale'; user='api::sale.sale.find'; admin='api::sale-report.sale-report.find'; role='rutba_app_user' },
  @{ app='accounts'; user='api::acc-account.acc-account.find'; admin='api::acc-settings.acc-settings.find'; role='rutba_app_user' },
  @{ app='accounts-ap'; user='api::acc-bill.acc-bill.find'; admin='api::acc-bill-approval.acc-bill-approval.find'; role='rutba_app_user' },
  @{ app='accounts-ar'; user='api::acc-invoice.acc-invoice.find'; admin='api::acc-invoice-approval.acc-invoice-approval.find'; role='rutba_app_user' },
  @{ app='accounts-viewer'; user='api::acc-account.acc-account.find'; admin=''; role='rutba_app_user' },
  @{ app='delivery'; user='api::sale-order.sale-order.find'; admin='api::delivery-settings.delivery-settings.find'; role='rutba_app_user' },
  @{ app='rider'; user='api::rider.rider.find'; admin='api::rider-settings.rider-settings.find'; role='rutba_app_user' },
  @{ app='crm'; user='api::crm-contact.crm-contact.find'; admin='api::crm-segment.crm-segment.find'; role='rutba_app_user' },
  @{ app='auth'; user='api::auth-admin.auth-admin.find'; admin='api::role-permission.role-permission.find'; role='rutba_app_user' },
  @{ app='web-user'; user='api::sale-order.sale-order.find'; admin=''; role='rutba_web_user' },
  @{ app='hr'; user='api::hr-employee.hr-employee.find'; admin='api::hr-policy.hr-policy.find'; role='rutba_app_user' },
  @{ app='payroll'; user='api::pay-salary-structure.pay-salary-structure.find'; admin='api::pay-settings.pay-settings.find'; role='rutba_app_user' },
  @{ app='cms'; user='api::cms-page.cms-page.find'; admin='api::cms-workflow.cms-workflow.find'; role='rutba_app_user' },
  @{ app='social'; user='api::social-post.social-post.find'; admin='api::social-analytics.social-analytics.find'; role='rutba_app_user' }
)

$created = @()
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

foreach ($m in $matrix) {
  $appId = Get-AppId $m.app
  $roleId = if ($m.role -eq 'rutba_web_user') { [int]$webRole.id } else { [int]$appRole.id }

  $uName = "perm.user.$($m.app).$suffix"
  $aName = "perm.admin.$($m.app).$suffix"
  $pwd = 'Passw0rd!123'

  $createUser = Invoke-Api -Method 'POST' -Path '/auth-admin/users' -Headers $authHeaders -Body @{
    username = $uName
    displayName = "U $($m.app)"
    email = "$uName@example.test"
    password = $pwd
    confirmed = $true
    blocked = $false
    role = $roleId
    app_accesses = @($appId)
    admin_app_accesses = @()
  }
  Assert-Status -Name "create user $($m.app)" -Expected 200 -Result $createUser
  $userId = [int]$createUser.data.id
  $created += $userId

  $createAdmin = Invoke-Api -Method 'POST' -Path '/auth-admin/users' -Headers $authHeaders -Body @{
    username = $aName
    displayName = "A $($m.app)"
    email = "$aName@example.test"
    password = $pwd
    confirmed = $true
    blocked = $false
    role = $roleId
    app_accesses = @($appId)
    admin_app_accesses = @($appId)
  }
  Assert-Status -Name "create admin $($m.app)" -Expected 200 -Result $createAdmin
  $adminId = [int]$createAdmin.data.id
  $created += $adminId

  $userJwt = Login -identifier "$uName@example.test" -password $pwd
  $adminJwtLocal = Login -identifier "$aName@example.test" -password $pwd

  $uPerm = Invoke-Api -Method 'POST' -Path '/me/permissions' -Headers @{ Authorization = "Bearer $userJwt"; 'X-Rutba-App' = $m.app } -Body @{ time=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  Assert-Status -Name "me perms user $($m.app)" -Expected 200 -Result $uPerm
  $uList = @($uPerm.data.permissions)

  if (-not ($uList -contains $m.user)) { throw "FAIL [user $($m.app)] missing expected $($m.user)" }
  if ($m.admin -and ($uList -contains $m.admin)) { throw "FAIL [user $($m.app)] unexpectedly has admin permission $($m.admin)" }
  Write-Host "PASS [user $($m.app)] permission boundaries"

  $aPerm = Invoke-Api -Method 'POST' -Path '/me/permissions' -Headers @{ Authorization = "Bearer $adminJwtLocal"; 'X-Rutba-App' = $m.app; 'X-Rutba-App-Admin' = $m.app } -Body @{ time=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
  Assert-Status -Name "me perms admin $($m.app)" -Expected 200 -Result $aPerm
  $aList = @($aPerm.data.permissions)

  if (-not ($aList -contains $m.user)) { throw "FAIL [admin $($m.app)] missing user permission $($m.user)" }
  if ($m.admin -and -not ($aList -contains $m.admin)) { throw "FAIL [admin $($m.app)] missing admin permission $($m.admin)" }
  Write-Host "PASS [admin $($m.app)] permission boundaries"
}

Write-Host 'Cleaning up created users...'
$created | ForEach-Object {
  $d = Invoke-Api -Method 'DELETE' -Path "/auth-admin/users/$_" -Headers $authHeaders
  if ($d.status -ne 200) { Write-Host "WARN failed deleting user $_" }
}

Write-Host 'All app permission matrix checks passed.' -ForegroundColor Green
