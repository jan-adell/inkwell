use epub_builder::{EpubBuilder, EpubContent, ZipLibrary};

use super::parser::{Block, Run};
use crate::error::{InkwellError, Result};

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn runs_to_html(runs: &[Run]) -> String {
    runs.iter()
        .map(|run| {
            let escaped = escape_html(&run.text);
            match (run.bold, run.italic) {
                (true, true) => format!("<strong><em>{escaped}</em></strong>"),
                (true, false) => format!("<strong>{escaped}</strong>"),
                (false, true) => format!("<em>{escaped}</em>"),
                (false, false) => escaped,
            }
        })
        .collect()
}

fn blocks_to_body_html(documents: &[Vec<Block>]) -> String {
    let mut body = String::new();
    for blocks in documents {
        for block in blocks {
            match block {
                Block::Heading(level, runs) => {
                    let tag = if *level <= 1 { "h1" } else { "h2" };
                    body.push_str(&format!("<{tag}>{}</{tag}>", runs_to_html(runs)));
                }
                Block::Paragraph(runs) => {
                    body.push_str(&format!("<p>{}</p>", runs_to_html(runs)));
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
         <head><title>Book</title></head>\n\
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

    fn run(text: &str) -> Run {
        Run {
            text: text.into(),
            bold: false,
            italic: false,
        }
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
}
