#target "InDesign"

(function () {
    var previousUI = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;

    try {
        if (app.documents.length === 0) {
            alert("Open an InDesign document before running this script.");
            return;
        }

        var doc = app.activeDocument;

        var mainFrame = findTextFrameByAltText(doc, "MAIN_TEXT");
        var kituvFrame = findTextFrameByAltText(doc, "KITUV");

        if (!mainFrame || !kituvFrame) {
            alert("Missing text frames labeled MAIN_TEXT and/or KITUV.");
            return;
        }

        var textFile = File.openDialog("Select text file", textFileFilter);
        if (!textFile) {
            return;
        }

        var bodyStyle = getParagraphStyle(doc, "body");
        var kituvStyle = getParagraphStyle(doc, "כיתוב");
        var b1Style = getCharacterStyle(doc, "B1");
        if (!bodyStyle || !kituvStyle || !b1Style) {
            return;
        }

        mainFrame.contents = "";
        kituvFrame.contents = "";

        mainFrame.place(textFile);
        var mainStory = mainFrame.parentStory;

        var kituvParagraph = findParagraphStartingWith(mainStory, "!");
        if (!kituvParagraph) {
            alert("Could not find a paragraph starting with '!'.");
            return;
        }

        var kituvText = stripTrailingReturn(kituvParagraph.contents);
        kituvText = kituvText.replace(/^\s*!\s*/, "");
        kituvParagraph.remove();

        kituvFrame.contents = kituvText;
        applyParagraphStyleToStory(kituvFrame.parentStory, kituvStyle, true);

        normalizeMainStory(mainStory);
        applyCharacterStyleToFontStyles(mainStory, b1Style, ["Bold", "Bold Italic"]);
        applyParagraphStyleToStory(mainStory, bodyStyle, false);

        alert("Text import and cleanup complete.");
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        resetFindChangePreferences();
        app.scriptPreferences.userInteractionLevel = previousUI;
    }
})();

function textFileFilter(file) {
    if (file instanceof Folder) {
        return true;
    }
    return /\.(docx?|rtf|txt)$/i.test(file.name);
}

function findTextFrameByAltText(doc, altText) {
    var frames = doc.textFrames;
    for (var i = 0; i < frames.length; i++) {
        if (getItemLabel(frames[i]) === altText) {
            return frames[i];
        }
    }

    var items = doc.allPageItems;
    for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (getItemLabel(item) !== altText) {
            continue;
        }
        var frame = getFirstTextFrameFromItem(item);
        if (frame) {
            return frame;
        }
    }

    return null;
}

function getFirstTextFrameFromItem(item) {
    try {
        if (item instanceof TextFrame) {
            return item;
        }
    } catch (error) {
    }

    try {
        if (item.textFrames && item.textFrames.length > 0) {
            return item.textFrames[0];
        }
    } catch (error2) {
    }

    return null;
}

function getItemLabel(item) {
    var label = "";
    try {
        if (item.objectExportOptions) {
            label = item.objectExportOptions.customAltText || "";
        }
    } catch (error) {
        label = "";
    }
    if (!label) {
        try {
            label = item.label || "";
        } catch (errorLabel) {
            label = "";
        }
    }
    return trimString(label);
}

function trimString(value) {
    return value.replace(/^\s+|\s+$/g, "");
}

function findParagraphStartingWith(story, marker) {
    var escaped = marker.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    var re = new RegExp("^\\s*" + escaped);
    var paragraphs = story.paragraphs;
    for (var i = 0; i < paragraphs.length; i++) {
        if (re.test(paragraphs[i].contents)) {
            return paragraphs[i];
        }
    }
    return null;
}

function stripTrailingReturn(text) {
    return text.replace(/\r$/, "");
}

function getParagraphStyle(doc, name) {
    var style = doc.paragraphStyles.itemByName(name);
    if (!style.isValid) {
        alert("Missing paragraph style: " + name);
        return null;
    }
    return style;
}

function getCharacterStyle(doc, name) {
    var style = doc.characterStyles.itemByName(name);
    if (!style.isValid) {
        alert("Missing character style: " + name);
        return null;
    }
    return style;
}

function applyParagraphStyleToStory(story, style, clearAllOverrides) {
    if (!story || !story.texts.length) {
        return;
    }
    var text = story.texts[0];
    text.appliedParagraphStyle = style;
    if (clearAllOverrides) {
        text.clearOverrides(OverrideType.ALL);
    } else {
        text.clearOverrides(OverrideType.PARAGRAPH_ONLY);
    }
}

function normalizeMainStory(story) {
    changeGrep(story, " {2,}", " ");
    changeGrep(story, "\\r{2,}", "\r");
}

function applyCharacterStyleToFontStyles(story, charStyle, fontStyles) {
    for (var i = 0; i < fontStyles.length; i++) {
        changeTextByFontStyle(story, fontStyles[i], charStyle);
    }
}

function changeTextByFontStyle(story, fontStyle, charStyle) {
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
    app.findTextPreferences.fontStyle = fontStyle;
    app.changeTextPreferences.appliedCharacterStyle = charStyle;
    story.changeText();
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
}

function changeGrep(story, findWhat, changeTo) {
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
    app.findGrepPreferences.findWhat = findWhat;
    app.changeGrepPreferences.changeTo = changeTo;
    story.changeGrep();
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
}

function resetFindChangePreferences() {
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
}
