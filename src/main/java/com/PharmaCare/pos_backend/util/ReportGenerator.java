package com.PharmaCare.pos_backend.util;

import com.PharmaCare.pos_backend.dto.response.ReportResponse;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Slf4j
public class ReportGenerator {

    private ReportGenerator() {
        // Utility class, no instantiation
    }

    public static byte[] generateSalesReportExcel(ReportResponse.SalesSummary salesSummary) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            // Create main sheet
            Sheet sheet = workbook.createSheet("Sales Report");

            // Create header style
            CellStyle headerStyle = createHeaderStyle(workbook);
            CellStyle currencyStyle = createCurrencyStyle(workbook);
            CellStyle dateStyle = createDateStyle(workbook);

            // Summary section
            int rowNum = 0;
            Row headerRow = sheet.createRow(rowNum++);
            headerRow.createCell(0).setCellValue("Sales Summary Report");
            headerRow.getCell(0).setCellStyle(headerStyle);

            rowNum++; // Empty row

            Row totalSalesRow = sheet.createRow(rowNum++);
            totalSalesRow.createCell(0).setCellValue("Total Sales:");
            totalSalesRow.createCell(1).setCellValue(salesSummary.getTotalSales().doubleValue());
            totalSalesRow.getCell(1).setCellStyle(currencyStyle);

            Row totalCostRow = sheet.createRow(rowNum++);
            totalCostRow.createCell(0).setCellValue("Total Cost:");
            totalCostRow.createCell(1).setCellValue(salesSummary.getTotalCost().doubleValue());
            totalCostRow.getCell(1).setCellStyle(currencyStyle);

            Row grossProfitRow = sheet.createRow(rowNum++);
            grossProfitRow.createCell(0).setCellValue("Gross Profit:");
            grossProfitRow.createCell(1).setCellValue(salesSummary.getGrossProfit().doubleValue());
            grossProfitRow.getCell(1).setCellStyle(currencyStyle);

            Row profitMarginRow = sheet.createRow(rowNum++);
            profitMarginRow.createCell(0).setCellValue("Profit Margin:");
            profitMarginRow.createCell(1).setCellValue(salesSummary.getProfitMargin());
            profitMarginRow.getCell(1).setCellStyle(createPercentageStyle(workbook));

            rowNum++; // Empty row

            // Sales by payment method
            Row paymentHeaderRow = sheet.createRow(rowNum++);
            paymentHeaderRow.createCell(0).setCellValue("Sales by Payment Method");
            paymentHeaderRow.getCell(0).setCellStyle(headerStyle);

            for (Map.Entry<String, BigDecimal> entry : salesSummary.getByPaymentMethod().entrySet()) {
                Row paymentRow = sheet.createRow(rowNum++);
                paymentRow.createCell(0).setCellValue(entry.getKey());
                paymentRow.createCell(1).setCellValue(entry.getValue().doubleValue());
                paymentRow.getCell(1).setCellStyle(currencyStyle);
            }

            rowNum++; // Empty row

            // Daily breakdown
            Row dailyHeaderRow = sheet.createRow(rowNum++);
            dailyHeaderRow.createCell(0).setCellValue("Daily Sales Breakdown");
            dailyHeaderRow.getCell(0).setCellStyle(headerStyle);

            Row dailySubHeaderRow = sheet.createRow(rowNum++);
            dailySubHeaderRow.createCell(0).setCellValue("Date");
            dailySubHeaderRow.createCell(1).setCellValue("Sales");
            dailySubHeaderRow.createCell(2).setCellValue("Profit");
            dailySubHeaderRow.createCell(3).setCellValue("Transactions");

            for (ReportResponse.SalesSummary.DailySales daily : salesSummary.getDailyBreakdown()) {
                Row dailyRow = sheet.createRow(rowNum++);
                dailyRow.createCell(0).setCellValue(daily.getDate().format(DateTimeFormatter.ISO_DATE));
                dailyRow.getCell(0).setCellStyle(dateStyle);
                dailyRow.createCell(1).setCellValue(daily.getSales().doubleValue());
                dailyRow.getCell(1).setCellStyle(currencyStyle);
                dailyRow.createCell(2).setCellValue(daily.getProfit().doubleValue());
                dailyRow.getCell(2).setCellStyle(currencyStyle);
                dailyRow.createCell(3).setCellValue(daily.getTransactions());
            }

            // Auto-size columns
            for (int i = 0; i < 4; i++) {
                sheet.autoSizeColumn(i);
            }

            workbook.write(out);
            return out.toByteArray();

        } catch (IOException e) {
            log.error("Failed to generate sales report Excel", e);
            throw new RuntimeException("Failed to generate report", e);
        }
    }

    public static byte[] generateStockReportExcel(ReportResponse.StockSummary stockSummary) {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = workbook.createSheet("Stock Report");

            CellStyle headerStyle = createHeaderStyle(workbook);
            CellStyle currencyStyle = createCurrencyStyle(workbook);

            int rowNum = 0;
            Row headerRow = sheet.createRow(rowNum++);
            headerRow.createCell(0).setCellValue("Stock Summary Report");
            headerRow.getCell(0).setCellStyle(headerStyle);

            rowNum++; // Empty row

            Row totalItemsRow = sheet.createRow(rowNum++);
            totalItemsRow.createCell(0).setCellValue("Total Items:");
            totalItemsRow.createCell(1).setCellValue(stockSummary.getTotalItems());

            Row totalQuantityRow = sheet.createRow(rowNum++);
            totalQuantityRow.createCell(0).setCellValue("Total Quantity:");
            totalQuantityRow.createCell(1).setCellValue(stockSummary.getTotalQuantity());

            Row totalValueRow = sheet.createRow(rowNum++);
            totalValueRow.createCell(0).setCellValue("Total Value:");
            totalValueRow.createCell(1).setCellValue(stockSummary.getTotalValue().doubleValue());
            totalValueRow.getCell(1).setCellStyle(currencyStyle);

            // Auto-size columns
            sheet.autoSizeColumn(0);
            sheet.autoSizeColumn(1);

            workbook.write(out);
            return out.toByteArray();

        } catch (IOException e) {
            log.error("Failed to generate stock report Excel", e);
            throw new RuntimeException("Failed to generate report", e);
        }
    }

    private static CellStyle createHeaderStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 14);
        style.setFont(font);
        return style;
    }

    private static CellStyle createCurrencyStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        DataFormat format = workbook.createDataFormat();
        style.setDataFormat(format.getFormat("#,##0.00"));
        return style;
    }

    private static CellStyle createPercentageStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        DataFormat format = workbook.createDataFormat();
        style.setDataFormat(format.getFormat("0.00%"));
        return style;
    }

    private static CellStyle createDateStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        DataFormat format = workbook.createDataFormat();
        style.setDataFormat(format.getFormat("yyyy-mm-dd"));
        return style;
    }
}