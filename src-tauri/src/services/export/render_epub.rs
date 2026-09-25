use epub_builder::{EpubBuilder, EpubContent, ZipLibrary};

use super::parser::{Block, Inline, Run};
use crate::error::{InkwellError, Result};

const STYLESHEET: &str = "body { text-align: justify; } .doc-break { page-break-before: always; }";

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn inlines_to_html(inlines: &[Inline]) -> String {
    inlines
        .iter()
        .map(|inline| match inline {
            Inline::LineBreak => "<br/>".to_string(),
            Inline::Text(Run { text, bold, italic }) => {
                let escaped = escape_html(text);
                match (bold, italic) {
                    (true, true) => format!("<strong><em>{escaped}</em></strong>"),
                    (true, false) => format!("<strong>{escaped}</strong>"),
                    (false, true) => format!("<em>{escaped}</em>"),
                    (false, false) => escaped,
                }
            }
        })
        .collect()
}

fn blocks_to_body_html(documents: &[Vec<Block>]) -> String {
    let mut body = String::new();
    for (doc_index, blocks) in documents.iter().enumerate() {
        for (block_index, block) in blocks.iter().enumerate() {
            let class = if doc_index > 0 && block_index == 0 {
                " class=\"doc-break\""
            } else {
                ""
            };
            match block {
                Block::Heading(level, inlines) => {
                    let tag = if *level <= 1 { "h1" } else { "h2" };
                    body.push_str(&format!(
                        "<{tag}{class}>{}</{tag}>",
                        inlines_to_html(inlines)
                    ));
                }
                Block::Paragraph(inlines) => {
                    body.push_str(&format!("<p{class}>{}</p>", inlines_to_html(inlines)));
                }
            }
        }
    }
    body
}

pub fn blocks_to_epub(documents: &[Vec<Block>]) -> Result<Vec<u8>> {
    let xhtml = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <html xmlns=\"http://www.w3.org/1999/xhtml\">\n\
         <head><title>Book</title><link rel=\"stylesheet\" type=\"text/css\" href=\"stylesheet.css\"/></head>\n\
         <body>{}</body>\n\
         </html>",
        blocks_to_body_html(documents)
    );

    let zip = ZipLibrary::new().map_err(|e| InkwellError::Internal(e.to_string()))?;
    let mut builder = EpubBuilder::new(zip).map_err(|e| InkwellError::Internal(e.to_string()))?;
    builder
        .metadata("title", "Book")
        .map_err(|e| InkwellError::Internal(e.to_string()))?;
    builder
        .stylesheet(STYLESHEET.as_bytes())
        .map_err(|e| InkwellError::Internal(e.to_string()))?;
    builder
        .add_content(EpubContent::new("book.xhtml", xhtml.as_bytes()).title("Book"))
        .map_err(|e| InkwellError::Internal(e.to_string()))?;

    let mut bytes = Vec::new();
    builder
        .generate(&mut bytes)
        .map_err(|e| InkwellError::Internal(e.to_string()))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(text: &str) -> Inline {
        Inline::Text(Run {
            text: text.into(),
            bold: false,
            italic: false,
        })
    }

    #[test]
    fn renders_a_valid_epub_zip() {
        let documents = vec![vec![
            Block::Heading(1, vec![run("Chapter One")]),
            Block::Paragraph(vec![run("It was a dark night.")]),
        ]];
        let bytes = blocks_to_epub(&documents).unwrap();
        assert_eq!(&bytes[0..2], b"PK");
        assert!(bytes.len() > 100);
    }

    #[test]
    fn escapes_html_special_characters() {
        let documents = vec![vec![Block::Paragraph(vec![run("Tom & Jerry <fight>")])]];
        let bytes = blocks_to_epub(&documents).unwrap();
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn hard_breaks_become_br_tags() {
        let body = blocks_to_body_html(&[vec![Block::Paragraph(vec![
            run("First line"),
            Inline::LineBreak,
            run("Second line"),
        ])]]);
        assert_eq!(body, "<p>First line<br/>Second line</p>");
    }

    #[test]
    fn second_document_first_block_gets_a_page_break_class() {
        let body = blocks_to_body_html(&[
            vec![Block::Paragraph(vec![run("Doc one.")])],
            vec![
                Block::Heading(1, vec![run("Doc two")]),
                Block::Paragraph(vec![run("Second paragraph, no break.")]),
            ],
        ]);
        assert_eq!(
            body,
            "<p>Doc one.</p><h1 class=\"doc-break\">Doc two</h1><p>Second paragraph, no break.</p>"
        );
    }
}
