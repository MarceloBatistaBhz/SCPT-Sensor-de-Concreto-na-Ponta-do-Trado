-- Filtro pandoc para gerar MANUAL.docx a partir do MANUAL.md (GFM).
-- H1 -> titulo do documento, 1o paragrafo -> subtitulo, demais titulos sobem um nivel,
-- remove linhas horizontais e cabecalhos de tabela vazios, quebra de pagina antes do
-- 1o titulo e imagens com largura fixa.

local function empty_head(head)
  for _, row in ipairs(head.rows) do
    for _, cell in ipairs(row.cells) do
      if #cell.contents > 0 then return false end
    end
  end
  return true
end

function Image(img)
  img.attributes.width = '7cm'
  return img
end

function Table(t)
  if empty_head(t.head) then
    t.head.rows = {}
  end
  return t
end

function Pandoc(doc)
  local blocks = pandoc.List()
  local got_title, got_subtitle, first_heading = false, false, true

  for _, b in ipairs(doc.blocks) do
    if b.t == 'HorizontalRule' then
      -- descarta
    elseif b.t == 'Header' and b.level == 1 and not got_title then
      doc.meta.title = pandoc.MetaInlines(b.content)
      got_title = true
    elseif b.t == 'Para' and got_title and not got_subtitle then
      doc.meta.subtitle = pandoc.MetaInlines(b.content)
      got_subtitle = true
    elseif b.t == 'Header' then
      if first_heading then
        blocks:insert(pandoc.RawBlock('openxml', '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'))
        first_heading = false
      end
      b.level = math.max(1, b.level - 1)
      blocks:insert(b)
    else
      blocks:insert(b)
    end
  end

  doc.blocks = blocks
  return doc
end
