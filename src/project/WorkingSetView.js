/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, window  */

/**
 * WorkingSetView generates the UI for the list of the files user is editing based on the model provided by EditorManager.
 * The UI allows the user to see what files are open/dirty and allows them to close files and specify the current editor.
 */
define(function (require, exports, module) {
    'use strict';

    // Load dependent modules
    var DocumentManager       = require("document/DocumentManager"),
        CommandManager        = require("command/CommandManager"),
        Commands              = require("command/Commands"),
        EditorManager         = require("editor/EditorManager"),
        FileViewController    = require("project/FileViewController"),
        NativeFileSystem      = require("file/NativeFileSystem").NativeFileSystem,
        ViewUtils             = require("utils/ViewUtils"),
        RelatedFiles          = require("project/RelatedFiles"),
        ProjectManager        = require("project/ProjectManager");
    
    
    /** Each list item in the working set stores a references to the related document in the list item's data.  
     *  Use listItem.data(_FILE_KEY) to get the document reference
     */
    var _FILE_KEY = "file",
        $openFilesContainer,
        $openFilesList;
    
    /**
     * @private
     * Redraw selection when list size changes or DocumentManager currentDocument changes.
     */
    function _fireSelectionChanged() {
        // redraw selection
        $openFilesList.trigger("selectionChanged");

        // in-lieu of resize events, manually trigger contentChanged to update scroll shadows
        $openFilesContainer.triggerHandler("contentChanged");
    }

    /**
     * @private
     * adds the style 'vertical-scroll' if a vertical scroll bar is present
     */
    function _adjustForScrollbars() {
        var $container = $("#open-files-container");
        if ($container[0].scrollHeight > $container[0].clientHeight) {
            if (!$container.hasClass("vertical-scroll")) {
                $container.addClass("vertical-scroll");
            }
        } else {
            $container.removeClass("vertical-scroll");
        }
    }
    
    /**
     * @private
     * Shows/Hides open files list based on working set content.
     */
    function _redraw() {
        if (DocumentManager.getWorkingSet().length === 0) {
            $openFilesContainer.hide();
        } else {
            $openFilesContainer.show();
        }
        _adjustForScrollbars();
        
        _fireSelectionChanged();
    }
    
    /** 
     * Updates the appearance of the list element based on the parameters provided
     * @private
     * @param {!HTMLLIElement} listElement
     * @param {bool} isDirty 
     * @param {bool} canClose
     */
    function _updateFileStatusIcon(listElement, isDirty, canClose) {
        var $fileStatusIcon = listElement.find(".file-status-icon");
        var showIcon = isDirty || canClose;

        // remove icon if its not needed
        if (!showIcon && $fileStatusIcon.length !== 0) {
            $fileStatusIcon.remove();
            $fileStatusIcon = null;
            
        // create icon if its needed and doesn't exist
        } else if (showIcon && $fileStatusIcon.length === 0) {
            
            $fileStatusIcon = $("<div class='file-status-icon'></div>")
                .prependTo(listElement)
                .click(function () {
                    // Clicking the "X" button is equivalent to File > Close; it doesn't merely
                    // remove a file from the working set
                    var file = listElement.data(_FILE_KEY);
                    CommandManager.execute(Commands.FILE_CLOSE, {file: file});
                });
        }

        // Set icon's class
        if ($fileStatusIcon) {
            // cast to Boolean needed because toggleClass() distinguishes true/false from truthy/falsy
            $fileStatusIcon.toggleClass("dirty", Boolean(isDirty));
            $fileStatusIcon.toggleClass("can-close", Boolean(canClose));
        }
    }
    
    function _toggleRelatedFilesDisplay($listItem, open) {
        
        var $relatedFiles = $($listItem.children(".working-set-related-files")[0]),
            $relatedFilesLink = $($listItem.children(".working-set-related-link")[0]);
        
        if (open) {
            $listItem.addClass("related-opened");
        } else {
            $listItem.removeClass("related-opened");
            $relatedFiles.empty();
        }
        _adjustForScrollbars();
    }
    
    /** 
     * Updates the appearance of the list element based on the parameters provided.
     * @private
     * @param {!HTMLLIElement} listElement
     * @param {?Document} selectedDoc
     */
    function _updateListItemSelection(listItem, selectedDoc) {
        var $listItem = $(listItem),
            shouldBeSelected = (selectedDoc && $listItem.data(_FILE_KEY).fullPath === selectedDoc.file.fullPath);
        
        // cast to Boolean needed because toggleClass() distinguishes true/false from truthy/falsy
        if (!shouldBeSelected && $listItem.hasClass("selected") && $listItem.hasClass("related-opened")) {
            window.setTimeout(function () {
                _toggleRelatedFilesDisplay($listItem, false);
                
                $listItem.toggleClass("selected", Boolean(shouldBeSelected));
                _fireSelectionChanged();
            }, 250);
        } else {
            $listItem.toggleClass("selected", Boolean(shouldBeSelected));
        }
        
        if (shouldBeSelected) {
            if (!RelatedFiles.hasLoaded(selectedDoc.file.fullPath)) {
                $listItem.addClass("related-files-loading");
            }
            
            RelatedFiles.findDocRelatedFiles(selectedDoc.file)
                .done(function () {
                    $listItem.removeClass("related-files-loading");
                    
                    var relatedFiles = RelatedFiles.getRelatedFiles(selectedDoc.file);
                    if (relatedFiles && relatedFiles.length > 0) {
                        if (!$listItem.hasClass("has-related-files")) {
                            $listItem.addClass("has-related-files");
                        }
                    } else {
                        $listItem.removeClass("has-related-files");
                    }
                })
                .fail(function () {
                    $listItem.removeClass("has-related-files");
                    $listItem.removeClass("related-files-loading");
                });
        }
    }

    function isOpenAndDirty(file) {
        var docIfOpen = DocumentManager.getOpenDocumentForPath(file.fullPath);
        return (docIfOpen && docIfOpen.isDirty);
    }
    
    function _bindRelatedFileLink($item, $relatedFiles, $relatedFilesLink, $relatedFile, file) {
        
        $relatedFile.click(function () {
            _toggleRelatedFilesDisplay($item, false);
            
            _updateFileStatusIcon($item, isOpenAndDirty(file), false);
            
            window.setTimeout(function () {
                FileViewController.addToWorkingSetAndSelect(file.fullPath);
            }, 0);
            return false;
        });
    }
    
    function _updateRelatedFilesStatus(file, $item) {
        
        var relatedFiles = RelatedFiles.getRelatedFiles(file);
        if (relatedFiles && relatedFiles.length > 0) {
            if (!$item.hasClass("has-related-files")) {
                $item.addClass("has-related-files");
            }
        } else {
            $item.removeClass("has-related-files");
        }
    }
    
    function _populateRelatedFiles($item, $relatedFiles, $relatedFilesLink, file) {
        var relatedFiles = RelatedFiles.getRelatedFiles(file),
            pathDisplay,
            pathTooltip,
            $relatedFile,
            i;
        $relatedFiles.empty();
        
        for (i = 0; relatedFiles && i < relatedFiles.length; i = i + 1) {
                    
            pathDisplay = relatedFiles[i].fullPath.substring(ProjectManager.getProjectRoot().fullPath.length);
            pathTooltip = RelatedFiles.getRelativeURI(ProjectManager.getProjectRoot().fullPath, relatedFiles[i].fullPath, file.fullPath);
                    
            $relatedFile = $("<a href='#'></a>").text(pathDisplay);
            $relatedFile.attr("title", pathTooltip);
            $relatedFiles.append($relatedFile);
                    
            _bindRelatedFileLink($item, $relatedFiles, $relatedFilesLink, $relatedFile, relatedFiles[i]);
        }
        
        _adjustForScrollbars();
    }

    
    /** 
     * Builds the UI for a new list item and inserts in into the end of the list
     * @private
     * @param {FileEntry} file
     * @return {HTMLLIElement} newListItem
     */
    function _createNewListItem(file) {
        var curDoc = DocumentManager.getCurrentDocument();

        // Create new list item with a link
        var $link = $("<a href='#'></a>").text(file.name);
        var $relatedFilesLink = $("<a class='working-set-related-link' href='#'></a>").html("&laquo;");
        var $relatedFiles = $("<div class='working-set-related-files'></div>");
        var $newItem = $("<li></li>")
            .append($link)
            .append($relatedFilesLink)
            .append($relatedFiles)
            .data(_FILE_KEY, file);

        $openFilesContainer.find("ul").append($newItem);
        
        // working set item might never have been opened; if so, then it's definitely not dirty

        // Update the listItem's apperance
        _updateFileStatusIcon($newItem, isOpenAndDirty(file), false);
        _updateListItemSelection($newItem, curDoc);
        
        $newItem.click(function () {
            
            $newItem.addClass("selected");
            if (!RelatedFiles.hasLoaded(file)) {
                $newItem.addClass("related-files-loading");
            } else {
                _updateRelatedFilesStatus(file, $newItem);
            }
            window.setTimeout(function () {
                FileViewController.openAndSelectDocument(file.fullPath, FileViewController.WORKING_SET_VIEW);
            }, 0);
        });

        $newItem.hover(
            function () {
                _updateFileStatusIcon($(this), isOpenAndDirty(file), true);
                _updateRelatedFilesStatus(file, $newItem);
            },
            function () {
                _updateFileStatusIcon($(this), isOpenAndDirty(file), false);
            }
        );
        
        $relatedFilesLink.click(function () {
            var relatedFiles,
                i,
                $relatedFile,
                pathDisplay,
                pathTooltip;
            
            if (!$newItem.hasClass("related-opened")) {
                _toggleRelatedFilesDisplay($newItem, true);
                
                _populateRelatedFiles($newItem, $relatedFiles, $relatedFilesLink, file);
                
            } else {
                _toggleRelatedFilesDisplay($newItem, false);
            }
        });
    }
    
    /** 
     * Deletes all the list items in the view and rebuilds them from the working set model
     * @private
     */
    function _rebuildWorkingSet() {
        $openFilesContainer.find("ul").empty();

        DocumentManager.getWorkingSet().forEach(function (file) {
            _createNewListItem(file);
        });

        _redraw();
    }
    
    /** 
     * @private
     */
    function _updateListSelection() {
        var doc;
        if (FileViewController.getFileSelectionFocus() === FileViewController.WORKING_SET_VIEW) {
            doc = DocumentManager.getCurrentDocument();
        } else {
            doc = null;
        }
        
        // Iterate through working set list and update the selection on each
        var items = $openFilesContainer.find("ul").children().each(function () {
            _updateListItemSelection(this, doc);
        });
        
        _fireSelectionChanged();
    }

    /** 
     * @private
     */
    function _handleFileAdded(file) {
        _createNewListItem(file);
        _redraw();
    }
    
    /** 
     * @private
     */
    function _handleDocumentSelectionChange() {
        _updateListSelection();
    }

    /** 
     * Finds the listItem item assocated with the file. Returns null if not found.
     * @private
     * @param {!FileEntry} file
     * @return {HTMLLIItem}
     */
    function _findListItemFromFile(file) {
        var result = null;

        if (file) {
            var items = $openFilesContainer.find("ul").children();
            items.each(function () {
                var $listItem = $(this);
                if ($listItem.data(_FILE_KEY).fullPath === file.fullPath) {
                    result = $listItem;
                    return false;
                    // breaks each
                }
            });
        }

        return result;
    }

    /** 
     * @private
     * @param {FileEntry} file 
     */
    function _handleFileRemoved(file) {
        var $listItem = _findListItemFromFile(file);
        if ($listItem) {
            $listItem.remove();
        }

        _redraw();
    }

    /** 
     * @private
     * @param {Document} doc 
     */
    function _handleDirtyFlagChanged(doc) {
        var listItem = _findListItemFromFile(doc.file);
        if (listItem) {
            var canClose = $(listItem).find("can-close").length === 1;
            _updateFileStatusIcon(listItem, doc.isDirty, canClose);
        }

    }

    function create(element) {
        // Init DOM element
        $openFilesContainer = element;
        $openFilesList = $openFilesContainer.find("ul");
        
        // Register listeners
        $(DocumentManager).on("workingSetAdd", function (event, addedFile) {
            _handleFileAdded(addedFile);
        });
    
        $(DocumentManager).on("workingSetRemove", function (event, removedFile) {
            _handleFileRemoved(removedFile);
        });
    
        $(DocumentManager).on("dirtyFlagChange", function (event, doc) {
            _handleDirtyFlagChanged(doc);
        });
        
        $(DocumentManager).on("documentSaved", function (event, doc) {
            window.setTimeout(function () {
                
                // Iterate through working set list and update the selection on each
                var items = $openFilesContainer.find("ul").children().each(function () {
                    if ($(this).data(_FILE_KEY).fullPath === doc.file.fullPath) {
                        if ($(this).hasClass("related-opened")) {
                            var $relatedFiles = $($(this).children(".working-set-related-files")[0]),
                                $relatedFilesLink = $($(this).children(".working-set-related-files-link")[0]);
                            $relatedFiles.empty();
                            _populateRelatedFiles($(this), $relatedFiles, $relatedFilesLink, doc.file);
                        }
                    }
                    
                });
            }, 10);
            
        });
    
        $(FileViewController).on("documentSelectionFocusChange", function (event, eventTarget) {
            _handleDocumentSelectionChange();
            _fireSelectionChanged();
        });
        
        // Show scroller shadows when open-files-container scrolls
        ViewUtils.addScrollerShadow($openFilesContainer[0], null, true);
        ViewUtils.sidebarList($openFilesContainer);
        
        _redraw();
    }
    
    exports.create = create;
});
