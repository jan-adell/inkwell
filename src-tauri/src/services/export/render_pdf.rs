use genpdf::fonts::{FontData, FontFamily};
use genpdf::style::Style;
use genpdf::{elements, Document, SimplePageDecorator};

use super::parser::{Block, Run};
use crate::error::{InkwellError, Result};

const REGULAR: &[u8] = include_bytes!("../../../assets/fonts/LiberationSerif-Regular.ttf");
const BOLD: &[u8] = include_bytes!("../../../assets/fonts/LiberationSerif-Bold.ttf");
const ITALIC: &[u8] = include_bytes!("../../../assets/fonts/LiberationSerif-Italic.ttf");
const BOLD_ITALIC: &[u8] = include_bytes!("../../../assets/fonts/LiberationSerif-BoldItalic.ttf");

const BODY_FONT_SIZE: u8 = 12;
const H1_FONT_SIZE: u8 = 20;
const H2_FONT_SIZE: u8 = 16;

fn load_font_family() -> Result<FontFamily<FontData>> {
    let load = |bytes: &[u8]| {
        FontData::new(bytes.to_vec(), None)
            .map_err(|e| InkwellError::Internal(format!("Failed to load embedded font: {e}")))
    };
    Ok(FontFamily {
        regular: load(REGULAR)?,
        bold: load(BOLD)?,
        italic: load(ITALIC)?,
        bold_italic: load(BOLD_ITALIC)?,
    })
}

fn push_runs(paragraph: &mut elements::Paragraph, runs: &[Run], font_size: u8) {
    for run in runs {
        let mut style = Style::new().with_font_size(font_size);
        if run.bold {
            style.set_bold();
        }
        if run.italic {
            style.set_italic();
        }
        paragraph.push_styled(run.text.clone(), style);
    }
}

pub fn blocks_to_pdf(documents: &[Vec<Block>]) -> Result<Vec<u8>> {
    let mut doc = Document::new(load_font_family()?);
    doc.set_title("Book");
    doc.set_font_size(BODY_FONT_SIZE);
    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(20);
    doc.set_page_decorator(decorator);

    for blocks in documents {
        for block in blocks {
            let mut paragraph = elements::Paragraph::default();
            match block {
                Block::Heading(level, runs) => {
                    let size = if *level <= 1 {
                        H1_FONT_SIZE
                    } else {
                        H2_FONT_SIZE
                    };
                    push_runs(&mut paragraph, runs, size);
                }
                Block::Paragraph(runs) => {
                    push_runs(&mut paragraph, runs, BODY_FONT_SIZE);
                }
            }
            doc.push(paragraph);
            doc.push(elements::Break::new(1));
        }
    }

    let mut bytes = Vec::new();
    doc.render(&mut bytes)
        .map_err(|e| InkwellError::Internal(format!("PDF render failed: {e}")))?;
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
    fn renders_a_valid_pdf() {
        let documents = vec![vec![
            Block::Heading(1, vec![run("Chapter One")]),
            Block::Paragraph(vec![
                run("It was a dark "),
                Run {
                    text: "and stormy".into(),
                    bold: true,
                    italic: false,
                },
                run(" night."),
            ]),
        ]];
        let bytes = blocks_to_pdf(&documents).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
        assert!(bytes.len() > 100);
    }

    #[test]
    fn renders_empty_book_without_error() {
        let bytes = blocks_to_pdf(&[]).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
    }
}
