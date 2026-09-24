use super::parser::{Block, Run};

pub fn blocks_to_txt(documents: &[Vec<Block>]) -> String {
    let mut out = String::new();
    for (index, blocks) in documents.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        for block in blocks {
            let runs = match block {
                Block::Paragraph(runs) => runs,
                Block::Heading(_, runs) => runs,
            };
            out.push_str(&runs_to_text(runs));
            out.push('\n');
        }
    }
    out
}

fn runs_to_text(runs: &[Run]) -> String {
    runs.iter().map(|run| run.text.as_str()).collect()
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
    fn joins_blocks_within_a_document_with_newlines() {
        let documents = vec![vec![
            Block::Heading(1, vec![run("Chapter One")]),
            Block::Paragraph(vec![run("It was a dark "), run("and stormy night.")]),
        ]];
        assert_eq!(
            blocks_to_txt(&documents),
            "Chapter One\nIt was a dark and stormy night.\n"
        );
    }

    #[test]
    fn separates_documents_with_a_blank_line() {
        let documents = vec![
            vec![Block::Paragraph(vec![run("First.")])],
            vec![Block::Paragraph(vec![run("Second.")])],
        ];
        assert_eq!(blocks_to_txt(&documents), "First.\n\nSecond.\n");
    }

    #[test]
    fn empty_input_yields_empty_string() {
        assert_eq!(blocks_to_txt(&[]), "");
    }
}
