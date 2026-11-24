UPDATE products
SET
  option_groups = json_set(option_groups, '$[1].selectionMode', 'personalizationLength'),
  personalization_max_chars = 20
WHERE id = 'prd_4d4ce2e4-4df6-44c9-9b64-433e14067182'
  AND multi_options_enabled = 1
  AND personalization_enabled = 1
  AND json_extract(option_groups, '$[1].id') = 'grp_letras';
