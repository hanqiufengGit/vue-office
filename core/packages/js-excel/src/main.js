import Spreadsheet from '../../vue-excel/src/x-spreadsheet/index';
import {getData, readExcelData, transferExcelToSpreadSheet} from '../../vue-excel/src/excel';
import {renderImage, clearCache} from '../../vue-excel/src/media';
import {readOnlyInput} from '../../vue-excel/src/hack';
import {debounce} from 'lodash';
import {download as downloadFile} from '../../../utils/url.js';
const defaultOptions = {
    xls: false,
    minColLength: 20
};
class JsExcelPreview {
    container = null;
    wrapper = null;
    wrapperMain = null;
    options = {};
    requestOptions = {};
    mediasSource = [];
    workbookDataSource = {
        _worksheets:[]
    };
    sheetIndex = 1;
    ctx = null;
    xs = null;
    offset = null;
    observer = null;
    fileData = null;

    constructor(container, options={}, requestOptions={}) {
        this.container = container;
        this.options = {...defaultOptions, ...options};
        this.requestOptions = requestOptions;
        this.createWrapper();
        this.initSpreadsheet();
        this.hack();
    }
    createWrapper(){
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'vue-office-excel';
        this.wrapperMain = document.createElement('div');
        this.wrapperMain.className = 'vue-office-excel-main';
        this.wrapper.appendChild(this.wrapperMain);
        this.container.appendChild(this.wrapper);
    }
    initSpreadsheet(){
        this.xs = new Spreadsheet(this.wrapperMain, {
            mode: 'read',
            showToolbar: false,
            showContextmenu: this.options.showContextmenu || false,
            view: {
                height: () => this.wrapper && this.wrapper.clientHeight || 300,
                width: () => this.wrapper && this.wrapper.clientWidth || 1200,
            },
            row: {
                height: 24,
                len: 100
            },
            col: {
                len: 26,
                width: 80,
                indexWidth: 60,
                minWidth: 60,
            },
            autoFocus: false
        }).loadData({});

        if(this.options.cellSelected && typeof this.options.cellSelected === 'function'){
            this.xs.on('cell-selected', (cell, ri, ci) => {
                this.options.cellSelected({
                    cell,
                    rowIndex: ri,
                    columnIndex: ci
                });
            });
        }
        if(this.options.cellsSelected && typeof this.options.cellsSelected === 'function'){
            this.xs.on('cells-selected', (cell, { sri, sci, eri, eci }) => {
                this.options.cellsSelected({
                    cell,
                    startRowIndex: sri,
                    startColumnIndex: sci,
                    endRowIndex: eri,
                    endColumnIndex: eci
                });
            });
        }

        let that = this;

        let swapFunc = this.xs.bottombar.swapFunc;
        this.xs.bottombar.swapFunc = function (index) {
            swapFunc.call(that.xs.bottombar, index);
            that.sheetIndex = index;
            setTimeout(()=>{
                that.xs.reRender();
                renderImage(that.ctx, that.mediasSource,that.workbookDataSource._worksheets[that.sheetIndex], that.offset);
            });

        };
        let clear = this.xs.sheet.editor.clear;
        this.xs.sheet.editor.clear = function (...args){
            clear.apply(that.xs.sheet.editor, args);
            setTimeout(()=>{
                renderImage(that.ctx, that.mediasSource,that.workbookDataSource._worksheets[that.sheetIndex], that.offset);
            });
        };
        let setOffset = this.xs.sheet.editor.setOffset;
        this.xs.sheet.editor.setOffset = function (...args){
            setOffset.apply(that.xs.sheet.editor, args);
            that.offset = args[0];
            renderImage(that.ctx, that.mediasSource,that.workbookDataSource._worksheets[that.sheetIndex], that.offset);
        };
        const canvas = this.wrapperMain.querySelector('canvas');
        this.ctx = canvas.getContext('2d');
    }
    renderExcel(buffer){
        this.fileData = buffer;
        return readExcelData(buffer, this.options.xls).then(workbook => {
            if (!workbook._worksheets || workbook._worksheets.length === 0) {
                throw new Error('未获取到数据，可能文件格式不正确或文件已损坏');
            }
            if(this.options.beforeTransformData && typeof this.options.beforeTransformData === 'function' ){
                workbook = this.options.beforeTransformData(workbook);
            }
            let {workbookData, medias, workbookSource} = transferExcelToSpreadSheet(workbook, this.options);
            if(this.options.transformData && typeof this.options.transformData === 'function' ){
                workbookData = this.options.transformData(workbookData);
            }
            this.mediasSource = medias;
            this.workbookDataSource = workbookSource;
            this.offset = null;
            this.sheetIndex = 0;
            clearCache();
            this.xs.loadData(workbookData);
            renderImage(this.ctx, this.mediasSource,this.workbookDataSource._worksheets[this.sheetIndex], this.offset);

        }).catch(e => {
            this.mediasSource = [];
            this.workbookDataSource = {
                _worksheets:[]
            };
            clearCache();
            this.xs.loadData({});
            return Promise.reject(e);
        });
    }
    hack(){
        const observerCallback = debounce(readOnlyInput, 200).bind(this, this.wrapperMain);
        this.observer = new MutationObserver(observerCallback);
        const observerConfig = { attributes: true, childList: true, subtree: true };
        this.observer.observe(this.wrapperMain, observerConfig);
        observerCallback(this.wrapperMain);
    }

    setOptions(options) {
        this.options = options;
    }
    setRequestOptions(requestOptions) {
        this.requestOptions = requestOptions;
    }
    preview(src){
        return new Promise(((resolve, reject) => {
            getData(src, this.requestOptions).then((res)=>{
                this.renderExcel(res).then(resolve).catch(e =>{
                    this.mediasSource = [];
                    this.workbookDataSource = {
                        _worksheets:[]
                    };
                    this.xs.loadData({});
                    reject(e);
                });
            }).catch(e => {
                this.mediasSource = [];
                this.workbookDataSource = {
                    _worksheets:[]
                };
                this.xs.loadData({});
                reject(e);
            });
        }));
    }
    save(fileName){
        downloadFile(fileName || `js-preview-excel-${new Date().getTime()}.xlsx`,this.fileData);
    }
    destroy(){
        this.observer.disconnect();
        this.container.removeChild(this.wrapper);
        this.container = null;
        this.wrapper = null;
        this.wrapperMain = null;
        this.ctx = null;
        this.xs = null;
        this.observer = null;
        this.options = null;
        this.requestOptions = null;
        this.mediasSource = null;
        this.workbookDataSource = null;
    }
}
export function init(container, options, requestOptions){
    return new JsExcelPreview(container, options, requestOptions);
}