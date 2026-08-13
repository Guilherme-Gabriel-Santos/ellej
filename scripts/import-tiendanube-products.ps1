param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,

  [switch]$OnlyOriginallyHidden
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("ellejew-catalog-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function SqlText([object]$Value) {
  if ($null -eq $Value) { return "NULL" }
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function StableUuid([string]$Value) {
  $md5 = [Security.Cryptography.MD5]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $hex = ([BitConverter]::ToString($md5.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    return $hex.Substring(0, 8) + "-" + $hex.Substring(8, 4) + "-" + $hex.Substring(12, 4) + "-" + $hex.Substring(16, 4) + "-" + $hex.Substring(20, 12)
  } finally {
    $md5.Dispose()
  }
}

function PlainText([string]$Html) {
  if ([string]::IsNullOrWhiteSpace($Html)) { return "" }
  $text = [regex]::Replace($Html, "(?i)<br\s*/?>|</p>|</li>", "`n")
  $text = [regex]::Replace($text, "<[^>]+>", " ")
  $text = [Net.WebUtility]::HtmlDecode($text).Replace([char]0xA0, " ")
  $text = [regex]::Replace($text, "[ \t]+", " ")
  $text = [regex]::Replace($text, "\s*`n\s*", "`n")
  return $text.Trim()
}

function MoneyValue([string]$Text, [string]$ProductName) {
  $normalized = $Text.Replace(",", "").Trim()
  [decimal]$value = 0
  $parsed = [decimal]::TryParse(
    $normalized,
    [Globalization.NumberStyles]::AllowDecimalPoint -bor [Globalization.NumberStyles]::AllowLeadingSign,
    [Globalization.CultureInfo]::InvariantCulture,
    [ref]$value
  )
  if (-not $parsed) { throw "Preco invalido no CSV para $ProductName (valor: [$Text])." }
  return $value
}

function ProductCategory([string]$Name, [string]$Categories) {
  if ($Name -match "(?i)^conjunto") { return "Conjuntos" }
  if ($Name -match "(?i)pulseira" -or $Categories -match "(?i)pulseiras") { return "Pulseiras" }
  if ($Name -match "(?i)brinco|ear cuff|piercing|argola" -or $Categories -match "(?i)brincos") { return "Brincos" }
  if ($Name -match "(?i)colar|choc?ker|ponto luz|riviera" -or $Categories -match "(?i)colares") { return "Colares" }
  return "Outros"
}

function ProductMaterial([string]$Name, [string]$Categories, [string]$Description) {
  $source = "$Categories $Description"
  if ($source -match "(?i)prata 925") {
    if ($source -match "(?i)ouro amarelo|ouro 18k") { return "Prata 925 - Banho de ouro 18k" }
    if ($source -match "(?i)ouro branco") { return "Prata 925 - Banho de ouro branco" }
    if ($Name -match "(?i)moissanite" -or $source -match "(?i)moissanite") { return "Prata 925 - Moissanite" }
    return "Prata 925"
  }
  if ($source -match "(?i)folhead[ao] a ouro 18k") { return "Semijoia folheada a ouro 18k" }
  if ($source -match "(?i)r[oó]dio") { return "Semijoia banhada a rodio" }
  return "Joia Elle Jew"
}

$existingIds = @{
  "chocker-5-coracoes" = "choker-coracoes"
  "colar-ponto-luz-o20k0" = "colar-ponto-luz"
  "conjunto-ametista-v4y9f" = "conjunto-ametista"
  "jew-com-brwww-ellejew-b" = "conjunto-kunzita"
  "ear-cuff-medio" = "ear-cuff-medio"
}

try {
  $allRows = @(Import-Csv -Delimiter ";" -Encoding Default -LiteralPath $CsvPath)
  if ($OnlyOriginallyHidden) {
    # These products were hidden when the CSV was exported, but can now be
    # imported after their original pages and images have been published.
    $rows = @($allRows | Where-Object { $_.'Exibir na loja' -ne "SIM" })
  } else {
    $rows = @($allRows | Where-Object { $_.'Exibir na loja' -eq "SIM" -and $_.Visibilidade -eq "Visivel" })
    if (-not $rows.Count) {
      # Windows PowerShell decodes the accented status correctly on pt-BR systems.
      $rows = @($allRows | Where-Object { $_.'Exibir na loja' -eq "SIM" })
    }
  }
  if (-not $rows.Count) { throw "Nenhum produto compativel foi encontrado no CSV." }

  $sql = New-Object Collections.Generic.List[string]
  $imported = New-Object Collections.Generic.List[object]
  $categoryOrder = @{ "Brincos" = 1; "Colares" = 2; "Conjuntos" = 3; "Pulseiras" = 4; "Outros" = 5 }

  foreach ($row in $rows) {
    $properties = @($row.PSObject.Properties)
    $handle = [string]$row.'Identificador URL'
    $name = [string]$row.Nome
    $pageUrl = "https://ellejew.com.br/produtos/$handle/"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $pageUrl -TimeoutSec 30

    $pageDescription = ""
    $imageUrl = ""
    $jsonMatches = [regex]::Matches($response.Content, '<script[^>]+type=["'']application/ld\+json["''][^>]*>(.*?)</script>', "Singleline")
    foreach ($match in $jsonMatches) {
      try {
        $data = ([Net.WebUtility]::HtmlDecode($match.Groups[1].Value) | ConvertFrom-Json)
        if ($data.mainEntity -and $data.mainEntity.'@type' -eq "Product") {
          $imageUrl = [string]$data.mainEntity.image
          $pageDescription = [string]$data.mainEntity.description
          break
        }
      } catch {}
    }
    if (-not $imageUrl) {
      $imageUrl = ([regex]::Matches($response.Content, 'https?[^"'']+?/products/[^"'']+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'']*)?', "IgnoreCase") |
        ForEach-Object { $_.Value -replace '^http:', 'https:' } |
        Where-Object { $_ -notmatch "pinterest" } |
        Select-Object -First 1)
    }
    if (-not $imageUrl) { throw "Foto publica nao encontrada para $name." }

    $key = (StableUuid $handle) + ".webp"
    $imagePath = Join-Path $tempRoot $key
    Invoke-WebRequest -UseBasicParsing -Uri $imageUrl -OutFile $imagePath -TimeoutSec 45
    if ((Get-Item -LiteralPath $imagePath).Length -lt 1000) { throw "Foto invalida para $name." }
    & npx.cmd wrangler r2 object put "elle-jew-media/$key" --file $imagePath --content-type "image/webp" --cache-control "public, max-age=31536000, immutable" --remote --config "wrangler.cloudflare.jsonc" --force | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar a foto de $name." }

    $descriptionColumn = $properties | Where-Object { $_.Name -like "Descri*o" -and $_.Name -notlike "*SEO*" } | Select-Object -First 1
    $description = PlainText ([string]$descriptionColumn.Value)
    if (-not $description) { $description = PlainText $pageDescription }
    $category = ProductCategory $name ([string]$row.Categorias)
    $material = ProductMaterial $name ([string]$row.Categorias) $description
    $priceColumn = $properties | Where-Object { $_.Name -like "Pre*o" -and $_.Name -notlike "*promocional*" } | Select-Object -First 1
    $promoColumn = $properties | Where-Object { $_.Name -like "Pre*o promocional" } | Select-Object -First 1
    $price = MoneyValue ([string]$priceColumn.Value) $name
    $promoText = [string]$promoColumn.Value
    $promo = if ($promoText) { MoneyValue $promoText $name } else { $null }
    $currentPrice = $price
    if ($null -ne $promo) { $currentPrice = $promo }
    $priceCents = [int][Math]::Round($currentPrice * 100)
    $compareCents = if ($null -ne $promo) { [int][Math]::Round($price * 100) } else { $null }
    $stock = 1
    if ([int]::TryParse([string]$row.Estoque, [ref]$stock) -eq $false -or $stock -lt 0) { $stock = 1 }
    $id = if ($existingIds.ContainsKey($handle)) { $existingIds[$handle] } else { "prd_import_$handle" }
    $badge = if ($null -ne $promo) { "Oferta" } else { $null }
    $image = "/api/media?key=$key"
    $categoryId = "cat_" + (StableUuid $category)

    $sql.Add("INSERT OR IGNORE INTO categories (id, name, slug, active, sort_order) VALUES ($(SqlText $categoryId), $(SqlText $category), $(SqlText $category.ToLowerInvariant()), 1, $($categoryOrder[$category]));")
    $sql.Add("INSERT INTO media_assets (key, content_type, size, original_name, uploaded_by) VALUES ($(SqlText $key), 'image/webp', $((Get-Item -LiteralPath $imagePath).Length), $(SqlText ($handle + '.webp')), 'catalog-import') ON CONFLICT(key) DO UPDATE SET size = excluded.size, original_name = excluded.original_name;")
    $sql.Add("INSERT INTO products (id, slug, name, category, description, material, image, badge, price_cents, compare_at_cents, stock, active) VALUES ($(SqlText $id), $(SqlText $handle), $(SqlText $name), $(SqlText $category), $(SqlText $description), $(SqlText $material), $(SqlText $image), $(SqlText $badge), $priceCents, $(if ($null -eq $compareCents) { 'NULL' } else { $compareCents }), $stock, 1) ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name, category = excluded.category, description = excluded.description, material = excluded.material, image = excluded.image, badge = excluded.badge, price_cents = excluded.price_cents, compare_at_cents = excluded.compare_at_cents, stock = excluded.stock, active = 1;")
    $imported.Add([pscustomobject]@{ Name = $name; Handle = $handle; Image = $key; PriceCents = $priceCents; Stock = $stock })
  }

  $sql.Add("INSERT INTO admin_audit_logs (user_id, action, entity_type, details) SELECT id, 'catalog.imported', 'product', $(SqlText ('{"source":"tiendanube-csv","products":' + $imported.Count + '}')) FROM admin_users ORDER BY created_at LIMIT 1;")
  $sqlPath = Join-Path $tempRoot "catalog.sql"
  [IO.File]::WriteAllText($sqlPath, ($sql -join "`n"), (New-Object Text.UTF8Encoding($false)))
  Push-Location $projectRoot
  try {
    & npx.cmd wrangler d1 execute elle-jew-db --remote --config wrangler.cloudflare.jsonc --file $sqlPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao gravar o catalogo no banco." }
  } finally {
    Pop-Location
  }
  [pscustomobject]@{ Imported = $imported.Count; Products = $imported } | ConvertTo-Json -Compress -Depth 4
} finally {
  $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
  $allowedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTemp.StartsWith($allowedTemp, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
