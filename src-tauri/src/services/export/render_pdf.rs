use genpdf::error::Error as GenpdfError;
use genpdf::fonts::{FontCache, FontData, FontFamily};
use genpdf::render;
use genpdf::style::Style;
use genpdf::{
    elements, Context, Document, Element, Position, RenderResult, SimplePageDecorator, Size,
};

use super::parser::{Block, Inline};
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

#[derive(Debug, Clone)]
struct MeasuredWord {
    text: String,
    style: Style,
    width: genpdf::Mm,
}

#[derive(Debug, Clone)]
enum MeasuredToken {
    Word(Box<MeasuredWord>),
    Break,
}

fn tokenize(inlines: &[Inline], font_size: u8, font_cache: &FontCache) -> Vec<MeasuredToken> {
    let mut tokens = Vec::new();
    for inline in inlines {
        match inline {
            Inline::LineBreak => tokens.push(MeasuredToken::Break),
            Inline::Text(run) => {
                let mut style = Style::new().with_font_size(font_size);
                if run.bold {
                    style.set_bold();
                }
                if run.italic {
                    style.set_italic();
                }
                for word in run.text.split_whitespace() {
                    let width = style.str_width(font_cache, word);
                    tokens.push(MeasuredToken::Word(Box::new(MeasuredWord {
                        text: word.to_string(),
                        style,
                        width,
                    })));
                }
            }
        }
    }
    tokens
}

#[derive(Debug)]
struct PackedLine {
    words: Vec<MeasuredWord>,
    forced_break: bool,
}

fn pack_lines(
    tokens: &[MeasuredToken],
    max_width: genpdf::Mm,
    space_width: genpdf::Mm,
) -> Vec<PackedLine> {
    let mut lines = Vec::new();
    let mut current: Vec<MeasuredWord> = Vec::new();
    let mut current_width = genpdf::Mm::from(0);

    for token in tokens {
        match token {
            MeasuredToken::Break => {
                lines.push(PackedLine {
                    words: std::mem::take(&mut current),
                    forced_break: true,
                });
                current_width = genpdf::Mm::from(0);
            }
            MeasuredToken::Word(word) => {
                if current.is_empty() {
                    current_width = word.width;
                    current.push(word.as_ref().clone());
                } else if current_width + space_width + word.width > max_width {
                    lines.push(PackedLine {
                        words: std::mem::take(&mut current),
                        forced_break: false,
                    });
                    current_width = word.width;
                    current.push(word.as_ref().clone());
                } else {
                    current_width = current_width + space_width + word.width;
                    current.push(word.as_ref().clone());
                }
            }
        }
    }
    if !current.is_empty() || lines.is_empty() {
        lines.push(PackedLine {
            words: current,
            forced_break: false,
        });
    }
    lines
}

fn extra_per_gap(natural_width: genpdf::Mm, max_width: genpdf::Mm, gap_count: usize) -> genpdf::Mm {
    if gap_count == 0 || natural_width >= max_width {
        return genpdf::Mm::from(0);
    }
    (max_width - natural_width) / gap_count as f64
}

struct JustifiedParagraph {
    tokens: Vec<MeasuredToken>,
    next_index: usize,
    font_size: u8,
}

impl JustifiedParagraph {
    fn new(inlines: &[Inline], font_size: u8, font_cache: &FontCache) -> Self {
        JustifiedParagraph {
            tokens: tokenize(inlines, font_size, font_cache),
            next_index: 0,
            font_size,
        }
    }
}

impl Element for JustifiedParagraph {
    fn render(
        &mut self,
        context: &Context,
        area: render::Area<'_>,
        _style: Style,
    ) -> std::result::Result<RenderResult, GenpdfError> {
        let mut result = RenderResult::default();
        if self.next_index >= self.tokens.len() {
            return Ok(result);
        }

        let base_style = Style::new().with_font_size(self.font_size);
        let space_width = base_style.str_width(&context.font_cache, " ");
        let line_height = base_style.line_height(&context.font_cache);
        let max_width = area.size().width;

        let remaining = &self.tokens[self.next_index..];
        let lines = pack_lines(remaining, max_width, space_width);
        let total_lines = lines.len();

        let mut y = genpdf::Mm::from(0);
        let mut tokens_consumed = 0usize;

        for (index, line) in lines.iter().enumerate() {
            if y + line_height > area.size().height {
                result.has_more = true;
                break;
            }

            let is_last_line = index == total_lines - 1;
            let gap_count = line.words.len().saturating_sub(1);
            let natural_width: genpdf::Mm = line
                .words
                .iter()
                .map(|w| w.width)
                .fold(genpdf::Mm::from(0), |acc, w| acc + w)
                + space_width * gap_count as f64;
            let should_justify = !is_last_line && !line.forced_break && gap_count > 0;
            let gap_width = if should_justify {
                space_width + extra_per_gap(natural_width, max_width, gap_count)
            } else {
                space_width
            };

            let mut x = genpdf::Mm::from(0);
            for word in &line.words {
                let position = Position::new(x, y);
                area.print_str(&context.font_cache, position, word.style, &word.text)?;
                x = x + word.width + gap_width;
            }

            tokens_consumed += line.words.len() + if line.forced_break { 1 } else { 0 };
            y += line_height;
            result.size = result
                .size
                .stack_vertical(Size::new(max_width, line_height));
        }

        self.next_index += tokens_consumed;
        Ok(result)
    }
}

pub fn blocks_to_pdf(documents: &[Vec<Block>]) -> Result<Vec<u8>> {
    let family = load_font_family()?;
    let measuring_cache = FontCache::new(family.clone());

    let mut doc = Document::new(family);
    doc.set_title("Book");
    doc.set_font_size(BODY_FONT_SIZE);
    let mut decorator = SimplePageDecorator::new();
    decorator.set_margins(20);
    doc.set_page_decorator(decorator);

    for (doc_index, blocks) in documents.iter().enumerate() {
        if doc_index > 0 {
            doc.push(elements::PageBreak::new());
        }
        for block in blocks {
            let (font_size, inlines) = match block {
                Block::Heading(level, inlines) => (
                    if *level <= 1 {
                        H1_FONT_SIZE
                    } else {
                        H2_FONT_SIZE
                    },
                    inlines,
                ),
                Block::Paragraph(inlines) => (BODY_FONT_SIZE, inlines),
            };
            doc.push(JustifiedParagraph::new(
                inlines,
                font_size,
                &measuring_cache,
            ));
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
    use crate::services::export::parser::Run;

    fn run(text: &str) -> Inline {
        Inline::Text(Run {
            text: text.into(),
            bold: false,
            italic: false,
        })
    }

    fn word(text: &str, width: i32) -> MeasuredWord {
        MeasuredWord {
            text: text.into(),
            style: Style::new(),
            width: genpdf::Mm::from(width),
        }
    }

    fn measured(text: &str, width: i32) -> MeasuredToken {
        MeasuredToken::Word(Box::new(word(text, width)))
    }

    #[test]
    fn packs_words_that_fit_onto_one_line() {
        let tokens = vec![measured("aa", 10), measured("bb", 10), measured("cc", 10)];
        let lines = pack_lines(&tokens, genpdf::Mm::from(50), genpdf::Mm::from(2));
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].words.len(), 3);
        assert!(!lines[0].forced_break);
    }

    #[test]
    fn wraps_to_a_new_line_when_a_word_would_overflow() {
        let tokens = vec![measured("aa", 10), measured("bb", 10), measured("cc", 10)];
        let lines = pack_lines(&tokens, genpdf::Mm::from(21), genpdf::Mm::from(2));
        assert_eq!(lines.len(), 3);
        for line in &lines {
            assert_eq!(line.words.len(), 1);
        }
    }

    #[test]
    fn hard_break_forces_a_new_line_and_is_marked_forced() {
        let tokens = vec![measured("aa", 10), MeasuredToken::Break, measured("bb", 10)];
        let lines = pack_lines(&tokens, genpdf::Mm::from(50), genpdf::Mm::from(2));
        assert_eq!(lines.len(), 2);
        assert!(lines[0].forced_break);
        assert!(!lines[1].forced_break);
    }

    #[test]
    fn consecutive_hard_breaks_produce_a_blank_line() {
        let tokens = vec![
            measured("aa", 10),
            MeasuredToken::Break,
            MeasuredToken::Break,
            measured("bb", 10),
        ];
        let lines = pack_lines(&tokens, genpdf::Mm::from(50), genpdf::Mm::from(2));
        assert_eq!(lines.len(), 3);
        assert!(lines[1].words.is_empty());
        assert!(lines[1].forced_break);
    }

    #[test]
    fn trailing_hard_break_does_not_add_a_spurious_line() {
        let tokens = vec![measured("aa", 10), MeasuredToken::Break];
        let lines = pack_lines(&tokens, genpdf::Mm::from(50), genpdf::Mm::from(2));
        assert_eq!(lines.len(), 1);
        assert!(lines[0].forced_break);
    }

    #[test]
    fn extra_per_gap_distributes_leftover_width_evenly() {
        let extra = extra_per_gap(genpdf::Mm::from(30), genpdf::Mm::from(50), 2);
        assert_eq!(extra, genpdf::Mm::from(10));
    }

    #[test]
    fn extra_per_gap_is_zero_with_no_gaps_or_no_leftover() {
        assert_eq!(
            extra_per_gap(genpdf::Mm::from(30), genpdf::Mm::from(50), 0),
            genpdf::Mm::from(0)
        );
        assert_eq!(
            extra_per_gap(genpdf::Mm::from(50), genpdf::Mm::from(50), 2),
            genpdf::Mm::from(0)
        );
    }

    #[test]
    fn renders_a_valid_pdf() {
        let documents = vec![vec![
            Block::Heading(1, vec![run("Chapter One")]),
            Block::Paragraph(vec![
                run("It was a dark and stormy night."),
                Inline::LineBreak,
                run("Truly."),
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

    #[test]
    fn multiple_documents_render_without_error() {
        let documents = vec![
            vec![Block::Paragraph(vec![run("Document one.")])],
            vec![Block::Paragraph(vec![run("Document two.")])],
        ];
        let bytes = blocks_to_pdf(&documents).unwrap();
        assert!(bytes.starts_with(b"%PDF"));
    }
}
