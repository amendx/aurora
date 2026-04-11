// Mock Data baseado nos dados reais da API - Março 2026
// 26 plantões distribuídos em 22 dias

export const MOCK_USER_DATA = {
  id: 70917,
  name: "Dra. Amanda Esmeraldo",
  email: "amanda@plantaoativo.com",
  token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
};

// Dados do monthly real - 26 plantões em 22 dias
export const MOCK_CALENDAR_DATA = {
  data: {
    previous: {
      month: "2026-02",
      days: []
    },
    current: {
      month: "2026-03", 
      days: [
        // Dias com 1 plantão (18 dias)
        { date: "2026-03-01", has_conflicts: false, has_transactions: false, shifts: ["shift001"] },
        { date: "2026-03-02", has_conflicts: false, has_transactions: false, shifts: ["shift002"] },
        { date: "2026-03-04", has_conflicts: false, has_transactions: false, shifts: ["shift004"] },
        { date: "2026-03-07", has_conflicts: false, has_transactions: false, shifts: ["shift007"] },
        { date: "2026-03-09", has_conflicts: false, has_transactions: false, shifts: ["shift009"] },
        { date: "2026-03-10", has_conflicts: false, has_transactions: false, shifts: ["shift010"] },
        { date: "2026-03-13", has_conflicts: false, has_transactions: false, shifts: ["shift013"] },
        { date: "2026-03-16", has_conflicts: false, has_transactions: false, shifts: ["shift016"] },
        { date: "2026-03-17", has_conflicts: false, has_transactions: false, shifts: ["shift017"] },
        { date: "2026-03-18", has_conflicts: false, has_transactions: false, shifts: ["shift018"] },
        { date: "2026-03-20", has_conflicts: false, has_transactions: false, shifts: ["shift020"] },
        { date: "2026-03-23", has_conflicts: false, has_transactions: false, shifts: ["shift023"] },
        { date: "2026-03-24", has_conflicts: false, has_transactions: false, shifts: ["shift024"] },
        { date: "2026-03-25", has_conflicts: false, has_transactions: false, shifts: ["shift025"] },
        { date: "2026-03-26", has_conflicts: false, has_transactions: false, shifts: ["shift026"] },
        { date: "2026-03-27", has_conflicts: false, has_transactions: false, shifts: ["shift027"] },
        { date: "2026-03-30", has_conflicts: false, has_transactions: false, shifts: ["shift030"] },
        { date: "2026-03-31", has_conflicts: false, has_transactions: false, shifts: ["shift031"] },
        
        // Dias com 2 plantões (4 dias = 8 plantões)
        { date: "2026-03-03", has_conflicts: false, has_transactions: false, shifts: ["shift003a", "shift003b"] },
        { date: "2026-03-05", has_conflicts: false, has_transactions: false, shifts: ["shift005a", "shift005b"] },
        { date: "2026-03-12", has_conflicts: false, has_transactions: false, shifts: ["shift012a", "shift012b"] },
        { date: "2026-03-19", has_conflicts: false, has_transactions: false, shifts: ["shift019a", "shift019b"] }
      ]
    },
    next: {
      month: "2026-04",
      days: []
    }
  }
};

// Dados detalhados dos plantões por dia (baseado na estrutura real da API daily)
export const MOCK_DETAILED_SHIFTS = {
  // Plantões únicos (manhã na maioria)
  "2026-03-01": {
    data: {
      items: [
        { id: "shift001", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } }
      ]
    }
  },
  "2026-03-02": {
    data: {
      items: [
        { id: "shift002", label: "M", time: "07h00 - 13h00", group: { name: "Emergência", color: "#FF9800" } }
      ]
    }
  },
  "2026-03-04": {
    data: {
      items: [
        { id: "shift004", label: "T", time: "13h00 - 19h00", group: { name: "CTI", color: "#2196F3" } }
      ]
    }
  },
  "2026-03-07": {
    data: {
      items: [
        { id: "shift007", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } }
      ]
    }
  },
  "2026-03-09": {
    data: {
      items: [
        { id: "shift009", label: "M", time: "07h00 - 13h00", group: { name: "Emergência", color: "#FF9800" } }
      ]
    }
  },
  "2026-03-10": {
    data: {
      items: [
        { id: "shift010", label: "T", time: "13h00 - 19h00", group: { name: "CTI", color: "#2196F3" } }
      ]
    }
  },
  "2026-03-13": {
    data: {
      items: [
        { id: "shift013", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } }
      ]
    }
  },
  "2026-03-16": {
    data: {
      items: [
        { id: "shift016", label: "M", time: "07h00 - 13h00", group: { name: "Emergência", color: "#FF9800" } }
      ]
    }
  },
  "2026-03-17": {
    data: {
      items: [
        { id: "shift017", label: "T", time: "13h00 - 19h00", group: { name: "CTI", color: "#2196F3" } }
      ]
    }
  },
  "2026-03-18": {
    data: {
      items: [
        { id: "shift018", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } }
      ]
    }
  },
  "2026-03-20": {
    data: {
      items: [
        { id: "shift020", label: "M", time: "07h00 - 13h00", group: { name: "Emergência", color: "#FF9800" } }
      ]
    }
  },
  "2026-03-23": {
    data: {
      items: [
        { id: "shift023", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } }
      ]
    }
  },
  "2026-03-24": {
    data: {
      items: [
        { id: "shift024", label: "T", time: "13h00 - 19h00", group: { name: "CTI", color: "#2196F3" } }
      ]
    }
  },
  "2026-03-25": {
    data: {
      items: [
        { id: "shift025", label: "M", time: "07h00 - 13h00", group: { name: "Emergência", color: "#FF9800" } }
      ]
    }
  },
  "2026-03-26": {
    data: {
      items: [
        { id: "shift026", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } }
      ]
    }
  },
  "2026-03-27": {
    data: {
      items: [
        { id: "shift027", label: "N", time: "19h00 - 07h00", group: { name: "Emergência Noturna", color: "#9C27B0" } }
      ]
    }
  },
  "2026-03-30": {
    data: {
      items: [
        { id: "shift030", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } }
      ]
    }
  },
  "2026-03-31": {
    data: {
      items: [
        { id: "shift031", label: "T", time: "13h00 - 19h00", group: { name: "CTI", color: "#2196F3" } }
      ]
    }
  },

  // Dias com 2 plantões
  "2026-03-03": {
    data: {
      items: [
        { id: "shift003a", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } },
        { id: "shift003b", label: "N", time: "19h00 - 07h00", group: { name: "CTI Noturno", color: "#9C27B0" } }
      ]
    }
  },
  "2026-03-05": {
    data: {
      items: [
        { id: "shift005a", label: "M", time: "07h00 - 13h00", group: { name: "Emergência", color: "#FF9800" } },
        { id: "shift005b", label: "T", time: "13h00 - 19h00", group: { name: "CTI", color: "#2196F3" } }
      ]
    }
  },
  "2026-03-12": {
    data: {
      items: [
        { id: "shift012a", label: "M", time: "07h00 - 13h00", group: { name: "UTI Adulto", color: "#4CAF50" } },
        { id: "shift012b", label: "T", time: "13h00 - 19h00", group: { name: "Emergência", color: "#FF9800" } }
      ]
    }
  },
  "2026-03-19": {
    data: {
      items: [
        { id: "shift019a", label: "T", time: "13h00 - 19h00", group: { name: "CTI", color: "#2196F3" } },
        { id: "shift019b", label: "N", time: "19h00 - 07h00", group: { name: "UTI Noturno", color: "#9C27B0" } }
      ]
    }
  }
};

// Estatísticas esperadas dos dados acima:
// Total: 26 plantões
// Manhã (M): 14 plantões × 6h = 84h
// Tarde (T): 9 plantões × 6h = 54h  
// Noite (N): 3 plantões × 12h = 36h
// Total horas: 174h

export default {
  MOCK_USER_DATA,
  MOCK_CALENDAR_DATA,
  MOCK_DETAILED_SHIFTS
};