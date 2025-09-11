import { useEffect, useRef, useState } from "react";
import { SWATCHES } from "../../constants";
import { ColorSwatch, Group } from "@mantine/core";
import { Button } from "../../components/ui/button";
import axios from "axios";

interface Response {
  expr: string;
  result: string;
  assign: boolean;
}

interface GeneratedImage {
  expression: string;
  answer: string;
  id: string;
  position: { x: number; y: number };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#ffffff");
  const [reset, setReset] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [dictOfVars, setDictOfVars] = useState({});
  const [mathJaxLoaded, setMathJaxLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedItemId, setDraggedItemId] = useState<string>("");
  const [canvasHistory, setCanvasHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  useEffect(() => {
    if (reset) {
      resetCanvas();
      setResults([]);
      setDictOfVars({});
      setReset(false);
      setCanvasHistory([]);
      setHistoryStep(-1);
    }
  }, [reset]);

  useEffect(() => {
    if (results.length > 0 && mathJaxLoaded && window.MathJax) {
      setTimeout(() => {
        window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
      }, 0);
    }
  }, [results, mathJaxLoaded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight - canvas.offsetTop;
        ctx.lineCap = "round";
        ctx.lineWidth = 3;
        canvas.style.background = "black";

        saveCanvasState();
      }
    }

    // Load MathJax
    if (!window.MathJax) {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/config/TeX-MML-AM_CHTML.js";
      script.async = true;
      document.head.appendChild(script);

      script.onload = () => {
        window.MathJax.Hub.Config({
          tex2jax: {
            inlineMath: [
              ["$", "$"],
              ["\\(", "\\)"],
            ],
          },
        });
        setMathJaxLoaded(true);
      };

      return () => {
        if (document.head.contains(script)) {
          document.head.removeChild(script);
        }
      };
    } else {
      setMathJaxLoaded(true);
    }
  }, []);

  const generateUniqueId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const getCanvasCenter = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      return {
        x: canvas.width / 2,
        y: canvas.height / 2,
      };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  };

  //saving canvas state for undo functionality
  const saveCanvasState = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL();
      setCanvasHistory((prev) => {
        const newHistory = prev.slice(0, historyStep + 1);
        newHistory.push(dataUrl);
        return newHistory;
      });
      setHistoryStep((prev) => prev + 1);
    }
  };

  //undo function
  const undo = () => {
    if (historyStep > 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const prevStep = historyStep - 1;
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          };
          img.src = canvasHistory[prevStep];
          setHistoryStep(prevStep);
        }
      }
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        setIsDrawing(true);
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    saveCanvasState();
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
  };

  const sendData = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        console.error("VITE_API_URL environment variable is not set");
        alert("API URL is not configured");
        return;
      }

      const response = await axios({
        method: "POST",
        url: `${apiUrl}/calculate`,
        data: {
          image: canvas.toDataURL("image/png"),
          dict_of_vars: dictOfVars,
        },
      });

      const resp = response.data;
      console.log("Response: ", resp);

      const calculations = resp.data || [];

      if (Array.isArray(calculations)) {
        // Handle variable assignments
        calculations.forEach((data: Response) => {
          if (data.assign === true) {
            setDictOfVars((prev) => ({
              ...prev,
              [data.expr]: data.result,
            }));
          }
        });

        // Get center position for new expressions
        const centerPosition = getCanvasCenter();

        // Create new results with individual positions
        const newResults = calculations.map((data: Response) => ({
          expression: data.expr,
          answer: data.result,
          id: generateUniqueId(),
          position: { ...centerPosition },
        }));

        // Add new results to existing ones
        setResults((prev) => [...prev, ...newResults]);

        // Clear the canvas after processing
        setTimeout(() => {
          resetCanvas();
        }, 1000);
      } else {
        console.error("Expected array of calculations but got:", calculations);
      }
    } catch (error) {
      console.error("Error sending data:", error);
      alert(
        "Failed to process calculation. Please check if the backend is running."
      );
    }
  };

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setCanvasHistory([canvas.toDataURL()]);
        setHistoryStep(0);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent, itemId: string) => {
    setIsDragging(true);
    setDraggedItemId(itemId);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && draggedItemId) {
      setResults((prev) =>
        prev.map((result) =>
          result.id === draggedItemId
            ? {
                ...result,
                position: {
                  x: e.clientX - dragOffset.x,
                  y: e.clientY - dragOffset.y,
                },
              }
            : result
        )
      );
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedItemId("");
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, dragOffset, draggedItemId]);

  // Clear results when page is refreshed
  useEffect(() => {
    const handleBeforeUnload = () => {
      setResults([]);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button
          onClick={() => setReset(true)}
          className="z-20 bg-black text-white cursor-pointer"
          variant="default"
        >
          Reset
        </Button>
        <Button
          onClick={undo}
          disabled={historyStep <= 0}
          className="z-20 bg-black text-white cursor-pointer"
          variant="default"
        >
          Undo
        </Button>
        <Button
          onClick={sendData}
          className="z-20 bg-black text-white cursor-pointer"
          variant="default"
        >
          Calculate
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        id="canvas"
        className="absolute top-0 left-0 w-full h-full"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseOut={stopDrawing}
        onMouseUp={stopDrawing}
      />

      <Group className="z-20 absolute bottom-10 left-1/2 transform -translate-x-1/2">
        {SWATCHES.map((swatchColor: string) => (
          <ColorSwatch
            key={swatchColor}
            color={swatchColor}
            onClick={() => setColor(swatchColor)}
            className="cursor-pointer"
          />
        ))}
      </Group>

      {results.map((result) => (
        <div
          key={result.id}
          className="absolute p-2 text-white rounded shadow-md cursor-move select-none bg-black/50 backdrop-blur-sm"
          style={{
            left: result.position.x,
            top: result.position.y,
            zIndex: 30,
          }}
          onMouseDown={(e) => handleMouseDown(e, result.id)}
        >
          <div className="latex-content">
            {`${result.expression} = ${result.answer}`}
          </div>
        </div>
      ))}
    </>
  );
}
