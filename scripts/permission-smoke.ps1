$ErrorActionPreference = 'Stop'

$baseUrl = 'http://localhost:4010/api'
$adminToken = $env:RUTBA_ADMIN_TOKEN
if ([string]::IsNullOrWhiteSpace($adminToken)) {
  $adminToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyIiwic2Vzc2lvbklkIjoiOWFmNjZkMDMwMTAyODRhNWViYzlkNjJmMDM5NDFjODkiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc3MTEzODU2LCJleHAiOjE3NzcxMjEwNTZ9.2hTK_NYcPRo8rj67XHqCZe3pcLCDF3VStTXMMd2whtA'
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers,
    $Body = $null
  )

  $uri = "$baseUrl$Path"
  try {
    if ($null -ne $Body) {
      $json = $Body | ConvertTo-Json -Depth 10
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -ContentType 'application/json' -Body $json
    } else {
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
    }
    return @{ status = 200; data = $resp; raw = $null }
  } catch {
    $ex = $_.Exception
    if ($ex.Response -ne $null) {
      $statusCode = [int]$ex.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
      $raw = $reader.ReadToEnd()
      $reader.Close()
      $parsed = $null
      try { $parsed = $raw | ConvertFrom-Json } catch {}
      return @{ status = $statusCode; data = $parsed; raw = $raw }
    }
    throw
  }
}

function Assert-Status {
  param([string]$Name, [int]$Expected, $Result)
  if ($Result.status -ne $Expected) {
    $msg = "FAIL [$Name] expected $Expected got $($Result.status). Body: $($Result.raw)"
    throw $msg
  }
  Write-Host "PASS [$Name] -> $Expected"
}

$authAdminHeaders = @{
  Authorization = "Bearer $adminToken"
  'X-Rutba-App' = 'auth'
  'X-Rutba-App-Admin' = 'auth'
}

Write-Host 'Checking auth-admin bootstrap endpoints...'
$rolesResult = Invoke-Api -Method 'GET' -Path '/auth-admin/roles' -Headers $authAdminHeaders
Assert-Status -Name 'auth-admin roles access' -Expected 200 -Result $rolesResult

$roles = $rolesResult.data.roles
$appRole = $roles | Where-Object { $_.type -eq 'rutba_app_user' } | Select-Object -First 1
$webRole = $roles | Where-Object { $_.type -eq 'rutba_web_user' } | Select-Object -First 1
if (-not $appRole -or -not $webRole) { throw 'FAIL missing rutba_app_user or rutba_web_user role' }

$appAccessesResult = Invoke-Api -Method 'GET' -Path '/app-accesses' -Headers $authAdminHeaders
Assert-Status -Name 'app-accesses fetch' -Expected 200 -Result $appAccessesResult
$appAccesses = @($appAccessesResult.data.data)

function Get-AppAccessId([string]$key) {
  $item = $appAccesses | Where-Object { $_.key -eq $key } | Select-Object -First 1
  if (-not $item) { throw "Missing app access key: $key" }
  return [int]$item.id
}

$orderMgmtId = Get-AppAccessId 'order-management'
$stockId = Get-AppAccessId 'stock'
$webUserId = Get-AppAccessId 'web-user'

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$appUsername = "perm.app.$suffix"
$webUsername = "perm.web.$suffix"
$password = 'Passw0rd!123'

Write-Host 'Creating test users...'
$appCreate = Invoke-Api -Method 'POST' -Path '/auth-admin/users' -Headers $authAdminHeaders -Body @{
  username = $appUsername
  displayName = "Perm App $suffix"
  email = "$appUsername@example.test"
  password = $password
  confirmed = $true
  blocked = $false
  role = [int]$appRole.id
  app_accesses = @($orderMgmtId)
  admin_app_accesses = @()
}
Assert-Status -Name 'create rutba_app_user' -Expected 200 -Result $appCreate
$appUserId = [int]$appCreate.data.id

$webCreate = Invoke-Api -Method 'POST' -Path '/auth-admin/users' -Headers $authAdminHeaders -Body @{
  username = $webUsername
  displayName = "Perm Web $suffix"
  email = "$webUsername@example.test"
  password = $password
  confirmed = $true
  blocked = $false
  role = [int]$webRole.id
  app_accesses = @($webUserId)
  admin_app_accesses = @()
}
Assert-Status -Name 'create rutba_web_user' -Expected 200 -Result $webCreate
$webUserIdNumeric = [int]$webCreate.data.id

function Login-User([string]$identifier, [string]$pwd) {
  $candidates = @($identifier, "$identifier@example.test")
  foreach ($id in $candidates) {
    $r = Invoke-Api -Method 'POST' -Path '/auth/local' -Headers @{} -Body @{ identifier = $id; password = $pwd }
    if ($r.status -eq 200) {
      Write-Host "PASS [login $identifier via $id] -> 200"
      return $r.data.jwt
    }
  }
  throw "FAIL [login $identifier] could not authenticate with username or email."
}

$appJwt = Login-User -identifier $appUsername -pwd $password
$webJwt = Login-User -identifier $webUsername -pwd $password

function App-Headers([string]$jwt, [string]$app, [bool]$elevate = $false) {
  $h = @{ Authorization = "Bearer $jwt"; 'X-Rutba-App' = $app }
  if ($elevate) { $h['X-Rutba-App-Admin'] = $app }
  return $h
}

Write-Host 'Running permission checks...'

# rutba_app_user with order-management app access
$r1 = Invoke-Api -Method 'GET' -Path '/sale-orders?pagination[page]=1&pagination[pageSize]=5' -Headers (App-Headers -jwt $appJwt -app 'order-management')
Assert-Status -Name 'app-user order-management sale-orders allowed' -Expected 200 -Result $r1

$r2 = Invoke-Api -Method 'GET' -Path '/products?pagination[page]=1&pagination[pageSize]=5' -Headers (App-Headers -jwt $appJwt -app 'order-management')
Assert-Status -Name 'app-user order-management products denied' -Expected 403 -Result $r2

$r3 = Invoke-Api -Method 'GET' -Path '/sale-orders?pagination[page]=1&pagination[pageSize]=5' -Headers (App-Headers -jwt $appJwt -app 'stock')
Assert-Status -Name 'app-user stock app header denied (no stock access)' -Expected 403 -Result $r3

# grant admin app access and verify still allowed with elevate header
$u1 = Invoke-Api -Method 'PUT' -Path "/auth-admin/users/$appUserId" -Headers $authAdminHeaders -Body @{
  username = $appUsername
  displayName = "Perm App $suffix"
  email = "$appUsername@example.test"
  confirmed = $true
  blocked = $false
  role = [int]$appRole.id
  app_accesses = @($orderMgmtId)
  admin_app_accesses = @($orderMgmtId)
}
Assert-Status -Name 'assign app admin access order-management' -Expected 200 -Result $u1

$r4 = Invoke-Api -Method 'GET' -Path '/sale-orders?pagination[page]=1&pagination[pageSize]=5' -Headers (App-Headers -jwt $appJwt -app 'order-management' -elevate $true)
Assert-Status -Name 'app-user elevated order-management sale-orders allowed' -Expected 200 -Result $r4

# rutba_web_user checks
$r5 = Invoke-Api -Method 'GET' -Path '/sale-orders?pagination[page]=1&pagination[pageSize]=5' -Headers (App-Headers -jwt $webJwt -app 'web-user')
Assert-Status -Name 'web-user web-user sale-orders allowed' -Expected 200 -Result $r5

$r6 = Invoke-Api -Method 'GET' -Path '/hr-employees?pagination[page]=1&pagination[pageSize]=5' -Headers (App-Headers -jwt $webJwt -app 'web-user')
Assert-Status -Name 'web-user hr-employees denied' -Expected 403 -Result $r6

Write-Host 'Cleaning up test users...'
$del1 = Invoke-Api -Method 'DELETE' -Path "/auth-admin/users/$appUserId" -Headers $authAdminHeaders
Assert-Status -Name 'delete app test user' -Expected 200 -Result $del1
$del2 = Invoke-Api -Method 'DELETE' -Path "/auth-admin/users/$webUserIdNumeric" -Headers $authAdminHeaders
Assert-Status -Name 'delete web test user' -Expected 200 -Result $del2

Write-Host 'All permission smoke tests passed.' -ForegroundColor Green
