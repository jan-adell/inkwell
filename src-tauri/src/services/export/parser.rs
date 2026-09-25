use serde_json::Value;

use crate::error::Result;

#[derive(Debug, Clone, PartialEq)]
pub struct Run {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Inline {
    Text(Run),
    LineBreak,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Paragraph(Vec<Inline>),
    Heading(u8, Vec<Inline>),
}

pub fn parse_blocks(content_json: &str) -> Result<Vec<Block>> {
    let doc: Value = serde_json::from_str(content_json)?;
    let blocks = doc
        .get("content")
        .and_then(Value::as_array)
        .map(|nodes| nodes.iter().filter_map(parse_block).collect())
        .unwrap_or_default();
    Ok(blocks)
}

fn parse_block(node: &Value) -> Option<Block> {
    let inlines = parse_inlines(node.get("content"));
    match node.get("type").and_then(Value::as_str)? {
        "paragraph" => Some(Block::Paragraph(inlines)),
        "heading" => {
            let level = node
                .get("attrs")
                .and_then(|attrs| attrs.get("level"))
                .and_then(Value::as_u64)
                .unwrap_or(1) as u8;
            Some(Block::Heading(level, inlines))
        }
        _ => None,
    }
}

fn parse_inlines(content: Option<&Value>) -> Vec<Inline> {
    content
        .and_then(Value::as_array)
        .map(|nodes| nodes.iter().filter_map(parse_inline).collect())
        .unwrap_or_default()
}

fn parse_inline(node: &Value) -> Option<Inline> {
    match node.get("type").and_then(Value::as_str)? {
        "text" => parse_run(node).map(Inline::Text),
        "hardBreak" => Some(Inline::LineBreak),
        _ => None,
    }
}

fn parse_run(node: &Value) -> Option<Run> {
    let text = node.get("text").and_then(Value::as_str)?.to_string();
    let marks = node.get("marks").and_then(Value::as_array);
    let has_mark = |name: &str| {
        marks
            .map(|marks| {
                marks
                    .iter()
                    .any(|mark| mark.get("type").and_then(Value::as_str) == Some(name))
            })
            .unwrap_or(false)
    };
    Some(Run {
        text,
        bold: has_mark("bold"),
        italic: has_mark("italic"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(s: &str) -> Inline {
        Inline::Text(Run {
            text: s.into(),
            bold: false,
            italic: false,
        })
    }

    #[test]
    fn empty_doc_has_no_blocks() {
        let blocks = parse_blocks(r#"{"type":"doc","content":[]}"#).unwrap();
        assert_eq!(blocks, vec![]);
    }

    #[test]
    fn plain_paragraph() {
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(blocks, vec![Block::Paragraph(vec![text("Hello")])]);
    }

    #[test]
    fn paragraph_with_bold_and_italic_runs() {
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[
            {"type":"text","text":"Bold","marks":[{"type":"bold"}]},
            {"type":"text","text":"Italic","marks":[{"type":"italic"}]},
            {"type":"text","text":"Both","marks":[{"type":"bold"},{"type":"italic"}]}
        ]}]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(
            blocks,
            vec![Block::Paragraph(vec![
                Inline::Text(Run {
                    text: "Bold".into(),
                    bold: true,
                    italic: false
                }),
                Inline::Text(Run {
                    text: "Italic".into(),
                    bold: false,
                    italic: true
                }),
                Inline::Text(Run {
                    text: "Both".into(),
                    bold: true,
                    italic: true
                }),
            ])]
        );
    }

    #[test]
    fn heading_levels_one_and_two() {
        let json = r#"{"type":"doc","content":[
            {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Chapter One"}]},
            {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Scene break"}]}
        ]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(
            blocks,
            vec![
                Block::Heading(1, vec![text("Chapter One")]),
                Block::Heading(2, vec![text("Scene break")]),
            ]
        );
    }

    #[test]
    fn unknown_node_types_are_skipped() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","content":[{"type":"text","text":"Kept"}]},
            {"type":"horizontalRule"}
        ]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(blocks, vec![Block::Paragraph(vec![text("Kept")])]);
    }

    #[test]
    fn hard_break_becomes_a_line_break_inline() {
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[
            {"type":"text","text":"First line"},
            {"type":"hardBreak"},
            {"type":"text","text":"Second line"}
        ]}]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(
            blocks,
            vec![Block::Paragraph(vec![
                text("First line"),
                Inline::LineBreak,
                text("Second line"),
            ])]
        );
    }
}
