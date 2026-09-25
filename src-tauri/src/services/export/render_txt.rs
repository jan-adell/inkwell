use justify::{justify_paragraph, Settings};

use super::parser::{Block, Inline};

const LINE_WIDTH: usize = 80;
const PAGE_BREAK: char = '\x0C';

fn justify_settings() -> Settings<'static> {
    Settings {
        width: LINE_WIDTH,
        ..Settings::default()
    }
}

pub fn blocks_to_txt(documents: &[Vec<Block>]) -> String {
    let mut out = String::new();
    for (index, blocks) in documents.iter().enumerate() {
        if index > 0 {
            out.push(PAGE_BREAK);
            out.push('\n');
        }
        for block in blocks {
            let inlines = match block {
                Block::Paragraph(inlines) => inlines,
                Block::Heading(_, inlines) => inlines,
            };
            out.push_str(&block_to_text(inlines));
            out.push('\n');
        }
    }
    out
}

fn block_to_text(inlines: &[Inline]) -> String {
    let mut lines: Vec<String> = vec![String::new()];
    for inline in inlines {
        match inline {
            Inline::Text(run) => lines.last_mut().unwrap().push_str(&run.text),
            Inline::LineBreak => lines.push(String::new()),
        }
    }
    lines
        .iter()
        .map(|line| {
            if line.trim().is_empty() {
                String::new()
            } else {
                justify_paragraph(line, &justify_settings())
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::super::parser::Run;
    use super::*;

    fn text(s: &str) -> Inline {
        Inline::Text(Run {
            text: s.into(),
            bold: false,
            italic: false,
        })
    }

    #[test]
    fn joins_blocks_within_a_document_with_newlines() {
        let documents = vec![vec![
            Block::Heading(1, vec![text("Chapter One")]),
            Block::Paragraph(vec![text("It was a dark "), text("and stormy night.")]),
        ]];
        assert_eq!(
            blocks_to_txt(&documents),
            "Chapter One\nIt was a dark and stormy night.\n"
        );
    }

    #[test]
    fn hard_breaks_become_real_line_breaks() {
        let documents = vec![vec![Block::Paragraph(vec![
            text("First line"),
            Inline::LineBreak,
            text("Second line"),
        ])]];
        assert_eq!(blocks_to_txt(&documents), "First line\nSecond line\n");
    }

    #[test]
    fn separates_documents_with_a_form_feed_page_break() {
        let documents = vec![
            vec![Block::Paragraph(vec![text("First.")])],
            vec![Block::Paragraph(vec![text("Second.")])],
        ];
        assert_eq!(blocks_to_txt(&documents), "First.\n\u{0C}\nSecond.\n");
    }

    #[test]
    fn justifies_long_paragraphs_to_the_line_width_except_the_last_line() {
        let long_text = "word ".repeat(40);
        let documents = vec![vec![Block::Paragraph(vec![text(long_text.trim())])]];

        let output = blocks_to_txt(&documents);
        let lines: Vec<&str> = output.trim_end_matches('\n').split('\n').collect();

        assert!(lines.len() > 1);
        for line in &lines[..lines.len() - 1] {
            assert_eq!(line.chars().count(), LINE_WIDTH);
        }
        assert!(lines.last().unwrap().chars().count() <= LINE_WIDTH);
    }

    #[test]
    fn short_lines_are_left_unjustified() {
        let documents = vec![vec![Block::Paragraph(vec![text("Short line.")])]];
        assert_eq!(blocks_to_txt(&documents), "Short line.\n");
    }

    #[test]
    fn empty_input_yields_empty_string() {
        assert_eq!(blocks_to_txt(&[]), "");
    }
}
