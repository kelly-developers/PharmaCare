package com.PharmaCare.pos_backend.dto.response;

import java.math.BigDecimal;
import java.util.UUID;

public class SaleItemResponse {
    private UUID medicineId;
    private String medicineName;
    private String unitType;
    private int quantity;
    private BigDecimal unitPrice;
    private BigDecimal totalPrice;
    private BigDecimal costPrice;

    // getters and setters
}
